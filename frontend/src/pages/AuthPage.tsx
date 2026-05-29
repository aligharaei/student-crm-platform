export default function AuthPage() {
  // Supabase auth will be implemented in the `frontend-auth` to-do.
  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Student CRM</h1>
      <p className="text-sm opacity-80 mb-4">
        Auth is being wired up. For now, choose a role to preview the UI:
      </p>

      <div className="space-y-2">
        <button
          className="w-full border rounded px-3 py-2 hover:bg-black/5"
          onClick={() => {
            localStorage.setItem('crm_role', 'client')
            window.location.href = '/app/client'
          }}
        >
          Login as Client
        </button>
        <button
          className="w-full border rounded px-3 py-2 hover:bg-black/5"
          onClick={() => {
            localStorage.setItem('crm_role', 'sales')
            window.location.href = '/app/sales'
          }}
        >
          Login as Sales
        </button>
        <button
          className="w-full border rounded px-3 py-2 hover:bg-black/5"
          onClick={() => {
            localStorage.setItem('crm_role', 'manager')
            window.location.href = '/app/manager'
          }}
        >
          Login as Manager
        </button>
      </div>
    </div>
  )
}

