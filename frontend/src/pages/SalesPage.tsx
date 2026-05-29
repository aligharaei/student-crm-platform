import { useState } from 'react'

export default function SalesPage() {
  const [selectedConversationId, setSelectedConversationId] = useState('demo-conversation')

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Sales Workspace</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-4">
        <div className="border rounded p-3">
          <div className="text-sm font-medium mb-2">Assigned Conversations</div>
          <button
            className="w-full text-left border rounded px-2 py-2 hover:bg-black/5"
            onClick={() => setSelectedConversationId('demo-conversation')}
          >
            {selectedConversationId}
          </button>
          <div className="text-xs opacity-70 mt-3">
            Conversation assignment + deal creation will be wired in `realtime-chat-deals`.
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm opacity-70 mb-2">
            Selected: <span className="font-mono">{selectedConversationId}</span>
          </div>
          <div className="space-y-4">
            <div className="border rounded p-3">
              <div className="text-sm font-medium mb-2">Pipeline Board</div>
              <div className="text-sm opacity-70">
                Real deal data + realtime updates will be added in `realtime-chat-deals`.
              </div>
            </div>

            <div className="border rounded p-3">
              <div className="text-sm font-medium mb-2">Create Deal</div>
              <div className="text-sm opacity-70">Deal creation UI will be implemented later.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

