-- MVP schema for Student CRM + pipeline.
-- Apply this in Supabase SQL editor (or convert to migrations if you use Supabase CLI).

-- Extensions
create extension if not exists pgcrypto;

-- Role enum
do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('client', 'sales', 'manager');
  end if;
end $$;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.user_role not null default 'client',
  created_at timestamptz not null default now()
);

-- Conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_sales_profile_id uuid references public.profiles(id) on delete set null,
  created_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Pipeline stages (seeded fixed values for MVP)
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null unique
);

-- Deals
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  client_profile_id uuid not null references public.profiles(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  pipeline_stage_id uuid not null references public.pipeline_stages(id),
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Activity events (optional for MVP UI; still included for completeness)
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- updated_at trigger for deals
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at
before update on public.deals
for each row execute function public.set_updated_at();

-- Create profiles row on new auth user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'client'::public.user_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Seed pipeline stages (fixed values for MVP)
insert into public.pipeline_stages (name, sort_order)
values
  ('Qualified', 1),
  ('Proposal', 2),
  ('Negotiation', 3),
  ('Won', 4),
  ('Lost', 5)
on conflict (name) do update set
  sort_order = excluded.sort_order;

-- =========
-- RLS setup
-- =========

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.activity_events enable row level security;

-- Helpers: role of current user (reads own profile)
create or replace function public.role_of_current_user()
returns public.user_role
language sql
stable
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
$$;

-- Profiles policies: users can read/update their own profile
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
on public.profiles for select
using (id = auth.uid() or public.role_of_current_user() = 'manager');

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

-- Pipeline stages policies: authenticated users can read
drop policy if exists pipeline_stages_select_authed on public.pipeline_stages;
create policy pipeline_stages_select_authed
on public.pipeline_stages for select
using (auth.uid() is not null);

-- Conversations policies
drop policy if exists conversations_select_by_role on public.conversations;
create policy conversations_select_by_role
on public.conversations for select
using (
  public.role_of_current_user() in ('manager', 'sales', 'client')
  and (
    (public.role_of_current_user() = 'client' and client_profile_id = auth.uid())
    or (
      public.role_of_current_user() = 'sales'
      and (assigned_sales_profile_id = auth.uid() or assigned_sales_profile_id is null)
    )
    or (public.role_of_current_user() = 'manager')
  )
);

-- Client can create a conversation for themselves
drop policy if exists conversations_insert_client on public.conversations;
create policy conversations_insert_client
on public.conversations for insert
with check (
  public.role_of_current_user() = 'client'
  and client_profile_id = auth.uid()
  and created_by_profile_id = auth.uid()
);

-- Sales can assign themselves to an existing unassigned conversation
drop policy if exists conversations_update_sales_assign_self on public.conversations;
create policy conversations_update_sales_assign_self
on public.conversations for update
using (
  public.role_of_current_user() = 'sales'
  and assigned_sales_profile_id is null
  and client_profile_id is not null
)
with check (
  public.role_of_current_user() = 'sales'
  and assigned_sales_profile_id = auth.uid()
);

-- Manager can reassign conversation
drop policy if exists conversations_update_manager_assign on public.conversations;
create policy conversations_update_manager_assign
on public.conversations for update
using (public.role_of_current_user() = 'manager')
with check (public.role_of_current_user() = 'manager');

-- Messages policies: participants can read; sender can write (and must be a participant)
drop policy if exists messages_select_participants on public.messages;
create policy messages_select_participants
on public.messages for select
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.client_profile_id = auth.uid()
        or c.assigned_sales_profile_id = auth.uid()
        or public.role_of_current_user() = 'manager'
      )
  )
);

drop policy if exists messages_insert_sender_participant on public.messages;
create policy messages_insert_sender_participant
on public.messages for insert
with check (
  sender_profile_id = auth.uid()
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.client_profile_id = auth.uid()
        or c.assigned_sales_profile_id = auth.uid()
        or public.role_of_current_user() = 'manager'
      )
  )
);

-- Pipeline stages read already covered; no writes for MVP
drop policy if exists pipeline_stages_write_none on public.pipeline_stages;

-- Deals policies
drop policy if exists deals_select_by_role on public.deals;
create policy deals_select_by_role
on public.deals for select
using (
  public.role_of_current_user() in ('manager', 'sales', 'client')
  and (
    (public.role_of_current_user() = 'client' and client_profile_id = auth.uid())
    or (public.role_of_current_user() = 'sales' and owner_profile_id = auth.uid())
    or (public.role_of_current_user() = 'manager')
  )
);

-- Sales can create deals for themselves as owner
drop policy if exists deals_insert_sales on public.deals;
create policy deals_insert_sales
on public.deals for insert
with check (
  public.role_of_current_user() = 'sales'
  and owner_profile_id = auth.uid()
);

-- Manager can create deals for any owner (optional MVP convenience)
drop policy if exists deals_insert_manager on public.deals;
create policy deals_insert_manager
on public.deals for insert
with check (
  public.role_of_current_user() = 'manager'
);

-- Stage moves + owner reassignment: manager-only (Sales can update their own deals later if needed)
drop policy if exists deals_update_manager on public.deals;
create policy deals_update_manager
on public.deals for update
using (public.role_of_current_user() = 'manager')
with check (public.role_of_current_user() = 'manager');

