import { useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

export default function ManagerPage() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  type StageRow = { id: string; name: string; sort_order: number }
  type DealRow = {
    id: string
    title: string
    conversation_id: string
    client_profile_id: string
    owner_profile_id: string
    pipeline_stage_id: string
    created_at: string
    updated_at: string
  }
  type ProfileRow = { id: string; full_name: string | null; email: string | null }

  const workerBaseUrl = import.meta.env.VITE_WORKER_BASE_URL as string | undefined
  const meBase = workerBaseUrl?.replace(/\/$/, '') ?? ''

  const stagesQuery = useQuery({
    queryKey: ['pipeline_stages', 'manager'],
    enabled: !!accessToken,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id,name,sort_order')
        .order('sort_order')
      if (error) throw error
      return data as StageRow[]
    }
  })

  const dealsQuery = useQuery({
    queryKey: ['deals', 'manager-board'],
    enabled: !!accessToken,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id,title,conversation_id,client_profile_id,owner_profile_id,pipeline_stage_id,created_at,updated_at')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as DealRow[]
    }
  })

  const salesProfilesQuery = useQuery({
    queryKey: ['profiles', 'sales'],
    enabled: !!accessToken,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,full_name,email')
        .eq('role', 'sales')
        .order('full_name', { ascending: true })
      if (error) throw error
      return data as ProfileRow[]
    }
  })

  const conversationsQuery = useQuery({
    queryKey: ['conversations', 'manager'],
    enabled: !!accessToken,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id,assigned_sales_profile_id,client_profile_id')
      if (error) throw error
      return data as { id: string; assigned_sales_profile_id: string | null; client_profile_id: string }[]
    }
  })

  useEffect(() => {
    if (!accessToken) return

    const channel = supabase
      .channel('deals:manager')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deals' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['deals', 'manager-board'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [accessToken, queryClient])

  const dealsByStage = useMemo(() => {
    const stages = stagesQuery.data ?? []
    const groups: Record<string, DealRow[]> = {}
    for (const s of stages) groups[s.id] = []
    for (const d of dealsQuery.data ?? []) {
      if (!groups[d.pipeline_stage_id]) groups[d.pipeline_stage_id] = []
      groups[d.pipeline_stage_id].push(d)
    }
    return groups
  }, [dealsQuery.data, stagesQuery.data])

  const conversationById = useMemo(() => {
    const map: Record<string, { assigned_sales_profile_id: string | null; client_profile_id: string }> = {}
    for (const c of conversationsQuery.data ?? []) map[c.id] = c
    return map
  }, [conversationsQuery.data])

  async function moveDeal(dealId: string, pipelineStageId: string, ownerProfileId: string | null) {
    const url = meBase ? `${meBase}/api/deals/${dealId}/move-stage` : `/api/deals/${dealId}/move-stage`
    const body: Record<string, unknown> = { pipelineStageId }
    if (ownerProfileId) body.ownerProfileId = ownerProfileId

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      // eslint-disable-next-line no-alert
      alert((await res.json().catch(() => ({}))).error ?? 'Failed to move deal')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['deals', 'manager-board'] })
  }

  async function reassignConversation(conversationId: string, assignedSalesProfileId: string) {
    const url = meBase
      ? `${meBase}/api/conversations/${conversationId}/assign`
      : `/api/conversations/${conversationId}/assign`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ assignedSalesProfileId })
    })

    if (!res.ok) {
      // eslint-disable-next-line no-alert
      alert((await res.json().catch(() => ({}))).error ?? 'Failed to reassign conversation')
      return
    }

    queryClient.invalidateQueries({ queryKey: ['conversations', 'manager'] })
    queryClient.invalidateQueries({ queryKey: ['deals', 'manager-board'] })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Manager</h1>
        <button
          className="border rounded px-3 py-2 hover:bg-black/5"
          onClick={() => {
            void supabase.auth.signOut()
          }}
        >
          Sign out
        </button>
      </div>

      {!stagesQuery.data ? (
        <div className="text-sm opacity-70">Loading pipeline…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          {stagesQuery.data.map((s) => (
            <div key={s.id} className="border rounded p-2">
              <div className="text-sm font-medium mb-2">{s.name}</div>
              <div className="space-y-2">
                {(dealsByStage[s.id] ?? []).map((d) => {
                  const conversation = conversationById[d.conversation_id]
                  return (
                    <div key={d.id} className="border rounded p-2">
                      <div className="text-sm font-medium mb-1">{d.title || 'Untitled deal'}</div>
                      <div className="text-xs opacity-70 mb-2">Deal: {d.id.slice(0, 8)}…</div>

                      <div className="space-y-2">
                        <div className="text-xs opacity-70">Move stage</div>
                        <select
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={d.pipeline_stage_id}
                          onChange={(e) => {
                            void moveDeal(d.id, e.target.value, d.owner_profile_id)
                          }}
                        >
                          {stagesQuery.data?.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </select>

                        <div className="text-xs opacity-70">Reassign deal owner</div>
                        <select
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={d.owner_profile_id}
                          onChange={(e) => {
                            void moveDeal(d.id, d.pipeline_stage_id, e.target.value)
                          }}
                        >
                          {salesProfilesQuery.data?.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name ?? p.email ?? p.id}
                            </option>
                          ))}
                        </select>

                        {conversation?.assigned_sales_profile_id ? (
                          <div className="text-xs opacity-70">Conversation owner is synced via deal owner.</div>
                        ) : null}

                        <div className="text-xs opacity-70">Conversation owner</div>
                        <div className="flex gap-2">
                          <select
                            className="flex-1 border rounded px-2 py-1 text-sm"
                            value={conversation?.assigned_sales_profile_id ?? ''}
                            onChange={(e) => {
                              const newOwner = e.target.value
                              if (newOwner) void reassignConversation(d.conversation_id, newOwner)
                            }}
                          >
                            <option value="" disabled>
                              Select…
                            </option>
                            {salesProfilesQuery.data?.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.full_name ?? p.email ?? p.id}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="text-xs opacity-70">
                          Updated: {new Date(d.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

