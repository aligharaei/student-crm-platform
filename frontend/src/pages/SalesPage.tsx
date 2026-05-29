import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

export default function SalesPage() {
  const queryClient = useQueryClient()
  const { userId, role } = useAuth()

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messageBody, setMessageBody] = useState('')
  const [dealTitle, setDealTitle] = useState('')

  type ConversationRow = {
    id: string
    client_profile_id: string
    assigned_sales_profile_id: string | null
    created_at: string
  }

  type MessageRow = {
    id: string
    conversation_id: string
    sender_profile_id: string
    body: string
    created_at: string
  }

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

  const conversationsQuery = useQuery({
    queryKey: ['conversations', 'sales'],
    enabled: !!userId && role === 'sales',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id,client_profile_id,assigned_sales_profile_id,created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ConversationRow[]
    }
  })

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null
    return conversationsQuery.data?.find((c) => c.id === selectedConversationId) ?? null
  }, [selectedConversationId, conversationsQuery.data])

  useEffect(() => {
    if (!selectedConversationId && conversationsQuery.data?.length) {
      setSelectedConversationId(conversationsQuery.data[0].id)
    }
  }, [selectedConversationId, conversationsQuery.data])

  const stagesQuery = useQuery({
    queryKey: ['pipeline_stages'],
    enabled: !!userId && role === 'sales',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id,name,sort_order')
        .order('sort_order')
      if (error) throw error
      return data as { id: string; name: string; sort_order: number }[]
    }
  })

  const qualifiedStageId = useMemo(() => {
    return stagesQuery.data?.find((s) => s.name === 'Qualified')?.id ?? null
  }, [stagesQuery.data])

  const dealsQuery = useQuery({
    queryKey: ['deals', 'sales-board'],
    enabled: !!userId && role === 'sales',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select(
          'id,title,conversation_id,client_profile_id,owner_profile_id,pipeline_stage_id,created_at,updated_at'
        )
        .eq('owner_profile_id', userId)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as DealRow[]
    }
  })

  const messagesQuery = useQuery({
    queryKey: ['messages', selectedConversationId],
    enabled:
      !!userId &&
      role === 'sales' &&
      !!selectedConversationId &&
      selectedConversation?.assigned_sales_profile_id === userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id,conversation_id,sender_profile_id,body,created_at')
        .eq('conversation_id', selectedConversationId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as MessageRow[]
    }
  })

  useEffect(() => {
    if (!selectedConversationId) return
    if (!userId || role !== 'sales') return
    if (selectedConversation?.assigned_sales_profile_id !== userId) return

    const channel = supabase
      .channel(`messages:${selectedConversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedConversationId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, selectedConversation?.assigned_sales_profile_id, selectedConversationId, role, userId])

  useEffect(() => {
    if (!userId || role !== 'sales') return

    const channel = supabase
      .channel('deals:sales')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals',
          filter: `owner_profile_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['deals', 'sales-board'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, role, userId])

  async function claimConversation(conversationId: string) {
    if (!userId) return
    const { error } = await supabase
      .from('conversations')
      .update({ assigned_sales_profile_id: userId })
      .eq('id', conversationId)

    if (error) {
      // eslint-disable-next-line no-alert
      alert(error.message)
      return
    }

    queryClient.invalidateQueries({ queryKey: ['conversations', 'sales'] })
  }

  async function sendMessage() {
    if (!userId || !selectedConversationId) return
    if (selectedConversation?.assigned_sales_profile_id !== userId) return

    const body = messageBody.trim()
    if (!body) return

    const { error } = await supabase.from('messages').insert({
      conversation_id: selectedConversationId,
      sender_profile_id: userId,
      body
    })

    if (error) {
      // eslint-disable-next-line no-alert
      alert(error.message)
      return
    }

    setMessageBody('')
  }

  async function createDeal() {
    if (!userId || !selectedConversation || !qualifiedStageId) return
    const title = dealTitle.trim() || 'Untitled deal'

    const { error } = await supabase.from('deals').insert({
      conversation_id: selectedConversation.id,
      client_profile_id: selectedConversation.client_profile_id,
      owner_profile_id: userId,
      pipeline_stage_id: qualifiedStageId,
      title
    })

    if (error) {
      // eslint-disable-next-line no-alert
      alert(error.message)
      return
    }

    setDealTitle('')
    queryClient.invalidateQueries({ queryKey: ['deals', 'sales-board'] })
  }

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

  const stageName = (stageId: string) => {
    return stagesQuery.data?.find((s) => s.id === stageId)?.name ?? stageId
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Sales Workspace</h1>
        <button
          className="border rounded px-3 py-2 hover:bg-black/5"
          onClick={() => {
            void supabase.auth.signOut()
          }}
        >
          Sign out
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-4">
        <div className="border rounded p-3">
          <div className="text-sm font-medium mb-2">Conversations</div>
          {conversationsQuery.data?.length ? (
            <div className="space-y-2">
              {conversationsQuery.data.map((c) => {
                const isSelected = c.id === selectedConversationId
                const isClaimable = c.assigned_sales_profile_id === null
                const canSend = c.assigned_sales_profile_id === userId
                return (
                  <div key={c.id} className="border rounded p-2">
                    <button
                      className="w-full text-left"
                      style={{
                        background: isSelected ? 'rgba(0,0,0,0.04)' : 'transparent',
                        borderRadius: 6,
                        padding: 2
                      }}
                      onClick={() => setSelectedConversationId(c.id)}
                    >
                      <div className="text-sm font-medium">{c.id.slice(0, 8)}…</div>
                      <div className="text-xs opacity-70">
                        {canSend ? 'Assigned to you' : isClaimable ? 'Unassigned' : 'Assigned'}
                      </div>
                    </button>
                    {isClaimable ? (
                      <button
                        className="mt-2 w-full border rounded px-2 py-1 text-sm hover:bg-black/5"
                        onClick={() => {
                          void claimConversation(c.id)
                        }}
                      >
                        Claim
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-sm opacity-70">No conversations.</div>
          )}
        </div>

        <div className="border rounded p-4">
          {selectedConversationId ? (
            <>
              <div className="text-sm opacity-70 mb-3">
                Selected: <span className="font-mono">{selectedConversationId}</span>
              </div>

              <div className="space-y-4">
                <div className="border rounded p-3">
                  <div className="text-sm font-medium mb-2">Chat</div>
                  {selectedConversation?.assigned_sales_profile_id === userId ? (
                    <>
                      <div className="text-sm opacity-70 mb-2">Realtime chat with the client.</div>
                      <div className="border rounded p-2 max-h-[220px] overflow-auto space-y-2">
                        {messagesQuery.data?.length ? (
                          messagesQuery.data.map((m) => (
                            <div key={m.id} className="text-sm">
                              <div className="opacity-70 text-xs mb-1">
                                {m.sender_profile_id === userId
                                  ? 'You'
                                  : m.sender_profile_id.slice(0, 8) + '…'}
                              </div>
                              <div className="border rounded px-2 py-1">{m.body}</div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm opacity-70">No messages yet.</div>
                        )}
                      </div>

                      <div className="flex gap-2 mt-2">
                        <input
                          className="flex-1 border rounded px-3 py-2"
                          placeholder="Type a message…"
                          value={messageBody}
                          onChange={(e) => setMessageBody(e.target.value)}
                        />
                        <button
                          className="border rounded px-3 py-2 hover:bg-black/5"
                          onClick={() => {
                            void sendMessage()
                          }}
                        >
                          Send
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm opacity-70">Claim this conversation to start messaging.</div>
                  )}
                </div>

                <div className="border rounded p-3">
                  <div className="text-sm font-medium mb-2">Create Deal</div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border rounded px-3 py-2"
                      placeholder="Deal title (e.g. Math tutoring)"
                      value={dealTitle}
                      onChange={(e) => setDealTitle(e.target.value)}
                      disabled={selectedConversation?.assigned_sales_profile_id !== userId}
                    />
                    <button
                      className="border rounded px-3 py-2 hover:bg-black/5"
                      onClick={() => {
                        void createDeal()
                      }}
                      disabled={
                        selectedConversation?.assigned_sales_profile_id !== userId || !qualifiedStageId
                      }
                    >
                      Create
                    </button>
                  </div>
                  <div className="text-xs opacity-70 mt-2">
                    New deals start in the <span className="font-mono">Qualified</span> stage.
                  </div>
                </div>

                <div className="border rounded p-3">
                  <div className="text-sm font-medium mb-2">Pipeline Board</div>
                  {!stagesQuery.data ? (
                    <div className="text-sm opacity-70">Loading stages…</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {stagesQuery.data.map((s) => (
                        <div key={s.id} className="border rounded p-2">
                          <div className="text-sm font-medium mb-2">{s.name}</div>
                          {(dealsByStage[s.id] ?? []).filter((d) => d.conversation_id === selectedConversationId).length ? (
                            dealsByStage[s.id]
                              .filter((d) => d.conversation_id === selectedConversationId)
                              .map((d) => (
                                <div key={d.id} className="border rounded p-2 mb-2">
                                  <div className="text-sm font-medium">{d.title || 'Untitled deal'}</div>
                                  <div className="text-xs opacity-70">
                                    Updated: {new Date(d.updated_at).toLocaleDateString()}
                                  </div>
                                </div>
                              ))
                          ) : (
                            <div className="text-sm opacity-70">No deals here.</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border rounded p-3">
                  <div className="text-sm font-medium mb-2">Your Deals</div>
                  <div className="space-y-2">
                    {dealsQuery.data?.length ? (
                      dealsQuery.data.slice(0, 10).map((d) => (
                        <div key={d.id} className="border rounded p-2">
                          <div className="text-sm font-medium">{d.title || 'Untitled deal'}</div>
                          <div className="text-xs opacity-70">
                            Stage: {stageName(d.pipeline_stage_id)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm opacity-70">No deals yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm opacity-70">Select a conversation.</div>
          )}
        </div>
      </div>
    </div>
  )
}

