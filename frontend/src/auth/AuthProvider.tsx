import { createContext, useContext, useMemo } from 'react'

export type UserRole = 'client' | 'sales' | 'manager'

type AuthState = {
  loading: boolean
  role: UserRole | null
  // Used later by the Worker API layer.
  accessToken: string | null
  userId: string | null
}

const AuthContext = createContext<AuthState>({
  loading: false,
  role: null,
  accessToken: null,
  userId: null
})

export function useAuth() {
  return useContext(AuthContext)
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  // Stub until real Supabase auth is implemented in the next to-do.
  // This lets the router compile and makes it easy to inspect pages while wiring.
  const role = (localStorage.getItem('crm_role') as UserRole | null) ?? null
  const accessToken = localStorage.getItem('crm_access_token') ?? null
  const userId = localStorage.getItem('crm_user_id') ?? null

  const value = useMemo<AuthState>(
    () => ({ loading: false, role, accessToken, userId }),
    [role, accessToken, userId]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

