```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## Supabase schema (MVP)

The MVP uses Supabase Postgres with Row Level Security (RLS) and realtime.

1. Create/choose a Supabase project and enable:
   - Auth (email/password)
   - Postgres (tables + RLS policies)
   - Realtime (for `messages` and `deals` change feeds)
2. Apply the SQL schema:
   - Open Supabase Dashboard → **SQL Editor**
   - Paste the contents of [`supabase/migrations/001_init_mvp.sql`](supabase/migrations/001_init_mvp.sql)
   - Run the script

After applying the script:
- `pipeline_stages` is seeded with: `Qualified`, `Proposal`, `Negotiation`, `Won`, `Lost`.
- RLS policies are set up for roles: `client`, `sales`, `manager`.
