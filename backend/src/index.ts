import { Hono } from 'hono'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

type CloudflareBindings = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Headers', 'authorization, content-type')
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

  if (c.req.method === 'OPTIONS') return c.body(null, 204)
  return next()
})

function getBearerToken(c: { req: { header: (name: string) => string | undefined } }) {
  const auth = c.req.header('authorization')
  if (!auth) return null
  if (!auth.startsWith('Bearer ')) return null
  return auth.slice('Bearer '.length)
}

async function requireAuthedSupabase(c: { env: CloudflareBindings; req: { header: (n: string) => string | undefined } }) {
  const accessToken = getBearerToken(c)
  if (!accessToken) return null

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) return null

  const user = userData.user

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, email, full_name')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) return null

  return { supabase, user, profile, accessToken }
}

const meResponse = z.object({
  id: z.string().uuid(),
  role: z.enum(['client', 'sales', 'manager']),
  email: z.string().nullable(),
  full_name: z.string().nullable()
})

app.get('/api/me', async (c) => {
  const auth = await requireAuthedSupabase(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const res = {
    id: auth.profile.id,
    role: auth.profile.role,
    email: auth.profile.email ?? null,
    full_name: auth.profile.full_name ?? null
  }

  return c.json(meResponse.parse(res))
})

const assignBody = z.object({
  assignedSalesProfileId: z.string().uuid()
})

app.post('/api/conversations/:id/assign', async (c) => {
  const auth = await requireAuthedSupabase(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  if (auth.profile.role !== 'manager') return c.json({ error: 'Forbidden' }, 403)

  const conversationId = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = assignBody.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)

  const { data, error } = await auth.supabase
    .from('conversations')
    .update({ assigned_sales_profile_id: parsed.data.assignedSalesProfileId })
    .eq('id', conversationId)
    .select('id, client_profile_id, assigned_sales_profile_id')
    .single()

  if (error || !data) return c.json({ error: 'Failed to assign' }, 500)
  return c.json({ conversation: data })
})

const moveStageBody = z.object({
  pipelineStageId: z.string().uuid(),
  ownerProfileId: z.string().uuid().optional()
})

app.post('/api/deals/:id/move-stage', async (c) => {
  const auth = await requireAuthedSupabase(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  if (auth.profile.role !== 'manager') return c.json({ error: 'Forbidden' }, 403)

  const dealId = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = moveStageBody.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)

  const update: Record<string, unknown> = { pipeline_stage_id: parsed.data.pipelineStageId }
  if (parsed.data.ownerProfileId) update.owner_profile_id = parsed.data.ownerProfileId

  const { data, error } = await auth.supabase
    .from('deals')
    .update(update)
    .eq('id', dealId)
    .select('id, title, pipeline_stage_id, owner_profile_id')
    .single()

  if (error || !data) return c.json({ error: 'Failed to move stage' }, 500)
  return c.json({ deal: data })
})

app.get('/api/pipeline', async (c) => {
  const auth = await requireAuthedSupabase(c)
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  const role = auth.profile.role
  const { data: stages, error: stagesError } = await auth.supabase
    .from('pipeline_stages')
    .select('id, name, sort_order')
    .order('sort_order')

  if (stagesError || !stages) return c.json({ error: 'Failed to load stages' }, 500)

  let dealsQuery = auth.supabase
    .from('deals')
    .select(
      'id,title,created_at,updated_at,conversation_id,client_profile_id,owner_profile_id,pipeline_stage_id'
    )

  if (role === 'sales') dealsQuery = dealsQuery.eq('owner_profile_id', auth.user.id)
  if (role === 'client') dealsQuery = dealsQuery.eq('client_profile_id', auth.user.id)
  // manager sees all

  const { data: deals, error: dealsError } = await dealsQuery.order('created_at', { ascending: false })

  if (dealsError || !deals) return c.json({ error: 'Failed to load deals' }, 500)
  return c.json({ stages, deals })
})

app.get('/health', (c) => c.json({ ok: true }))

export default app
