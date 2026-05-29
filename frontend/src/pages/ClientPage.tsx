import { useState } from 'react'

export default function ClientPage() {
  const [conversationId, setConversationId] = useState<string>('demo-conversation')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Client</h1>

      <div className="grid grid-cols-1 md:grid-cols-[280px,1fr] gap-4">
        <div className="border rounded p-3">
          <div className="text-sm font-medium mb-2">Conversations</div>
          <button
            className="w-full text-left border rounded px-2 py-1 hover:bg-black/5"
            onClick={() => setConversationId('demo-conversation')}
          >
            Demo conversation
          </button>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm opacity-70 mb-3">
            Conversation: <span className="font-mono">{conversationId}</span>
          </div>
          <div className="space-y-2">
            <div className="text-sm border rounded p-2">Message list will be realtime.</div>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded px-3 py-2"
                placeholder="Type a message (wired later)"
                disabled
              />
              <button className="border rounded px-3 py-2" disabled>
                Send
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-medium mb-2">Deals</div>
            <div className="text-sm opacity-70">Deals and pipeline will be implemented in later to-dos.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

