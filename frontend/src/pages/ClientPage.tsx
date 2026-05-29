import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthProvider'

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

type StageMap = Record<string, string>

export default function ClientPage() {
  const queryClient = useQueryClient()
  const { userId, role } = useAuth()

  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messageBody, setMessageBody] = useState('')

  const conversationsQuery = useQuery({
    queryKey: ['conversations', 'client'],
    enabled: !!userId && role === 'client',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, client_profile_id, assigned_sales_profile_id, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ConversationRow[]
    }
  })

  const stagesQuery = useQuery({
    queryKey: ['pipeline_stages'],
    enabled: !!userId && role === 'client',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id, name')
        .order('sort_order')
      if (error) throw error
      const stages = data as { id: string; name: string }[]
      const map: StageMap = {}
      for (const s of stages) map[s.id] = s.name
      return map
    }
  })

  const dealsQuery = useQuery({
    queryKey: ['deals', 'client'],
    enabled: !!userId && role === 'client',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id,title,conversation_id,client_profile_id,owner_profile_id,pipeline_stage_id,created_at,updated_at')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as DealRow[]
    }
  })

  const messagesQuery = useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!userId && role === 'client' && !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id,conversation_id,sender_profile_id,body,created_at')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as MessageRow[]
    }
  })

  useEffect(() => {
    if (!conversationId && conversationsQuery.data?.length) {
      setConversationId(conversationsQuery.data[0].id)
    }
  }, [conversationId, conversationsQuery.data])

  const stageMap = useMemo(() => stagesQuery.data ?? {}, [stagesQuery.data])

  useEffect(() => {
    if (!userId || role !== 'client' || !conversationId) return

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, queryClient, role, userId])

  useEffect(() => {
    if (!userId || role !== 'client') return

    const channel = supabase
      .channel('deals:client')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals',
          filter: `client_profile_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['deals', 'client'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, role, userId])

  async function createConversation() {
    if (!userId) return

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        client_profile_id: userId,
        created_by_profile_id: userId
      })
      .select('id,client_profile_id,assigned_sales_profile_id,created_at')
      .single()

    if (error) throw error
    setConversationId(data.id)
  }

  async function sendMessage() {
    if (!userId || !conversationId) return
    const body = messageBody.trim()
    if (!body) return

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold">Client</h1>
        <button
          className="border rounded px-3 py-2 hover:bg-black/5"
          onClick={() => {
            void createConversation()
          }}
        >
          New conversation
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-4">
        <div className="border rounded p-3">
          <div className="text-sm font-medium mb-2">Conversations</div>
          {conversationsQuery.data?.length ? (
            <div className="space-y-1">
              {conversationsQuery.data.map((c) => (
                <button
                  key={c.id}
                  className="w-full text-left border rounded px-2 py-1 hover:bg-black/5"
                  style={{
                    background: c.id === conversationId ? 'rgba(0,0,0,0.04)' : 'transparent'
                  }}
                  onClick={() => setConversationId(c.id)}
                >
                  <div className="text-sm">{c.id.slice(0, 8)}…</div>
                  <div className="text-xs opacity-70">
                    {c.assigned_sales_profile_id ? 'Assigned' : 'Unassigned'}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-sm opacity-70">No conversations yet.</div>
          )}
        </div>

        <div className="border rounded p-4">
          {conversationId ? (
            <>
              <div className="text-sm opacity-70 mb-3">
                Conversation: <span className="font-mono">{conversationId}</span>
              </div>

              <div className="space-y-3">
                <div className="border rounded p-3 max-h-[320px] overflow-auto">
                  {messagesQuery.data?.length ? (
                    <div className="space-y-2">
                      {messagesQuery.data.map((m) => (
                        <div key={m.id} className="text-sm">
                          <div className="opacity-70 text-xs mb-1">
                            {m.sender_profile_id === userId ? 'You' : m.sender_profile_id.slice(0, 8) + '…'}
                          </div>
                          <div className="border rounded px-2 py-1">{m.body}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm opacity-70">No messages yet.</div>
                  )}
                </div>

                <div className="flex gap-2">
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
              </div>
            </>
          ) : (
            <div className="text-sm opacity-70">Select a conversation to chat.</div>
          )}

          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Deals</div>
            <div className="space-y-2">
              {dealsQuery.data?.length ? (
                dealsQuery.data.map((d) => (
                  <div key={d.id} className="border rounded p-2">
                    <div className="text-sm font-medium">{d.title || 'Untitled deal'}</div>
                    <div className="text-xs opacity-70">
                      Stage: {stageMap[d.pipeline_stage_id] ?? d.pipeline_stage_id.slice(0, 8) + '…'}
                    </div>
                    <div className="text-xs opacity-70">Updated: {new Date(d.updated_at).toLocaleString()}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm opacity-70">No deals yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

