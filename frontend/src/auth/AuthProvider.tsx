import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { z } from 'zod'

export type UserRole = 'client' | 'sales' | 'manager'

const meSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['client', 'sales', 'manager']),
  email: z.string().nullable(),
  full_name: z.string().nullable()
})

type AuthState = {
  loading: boolean
  role: UserRole | null
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
  const workerBaseUrl = import.meta.env.VITE_WORKER_BASE_URL as string | undefined

  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRole | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function hydrateSession() {
      setLoading(true)
      const { data, error } = await supabase.auth.getSession()
      if (cancelled) return
      if (error) {
        setRole(null)
        setAccessToken(null)
        setUserId(null)
        setLoading(false)
        return
      }

      const session = data.session
      const token = session?.access_token ?? null
      const uid = session?.user?.id ?? null

      setAccessToken(token)
      setUserId(uid)

      if (!token) {
        setRole(null)
        setLoading(false)
        return
      }

      const base = workerBaseUrl?.replace(/\/$/, '') ?? ''
      const meUrl = base ? `${base}/api/me` : '/api/me'

      const meRes = await fetch(meUrl, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!meRes.ok) {
        setRole(null)
        setLoading(false)
        return
      }

      const meJson = await meRes.json()
      const parsed = meSchema.safeParse(meJson)
      if (!parsed.success) {
        setRole(null)
        setLoading(false)
        return
      }

      setRole(parsed.data.role)
      setLoading(false)
    }

    hydrateSession()

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const token = session?.access_token ?? null
      const uid = session?.user?.id ?? null
      setAccessToken(token)
      setUserId(uid)

      if (!token) {
        setRole(null)
        return
      }

      const base = workerBaseUrl?.replace(/\/$/, '') ?? ''
      const meUrl = base ? `${base}/api/me` : '/api/me'
      const meRes = await fetch(meUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (!meRes.ok) {
        setRole(null)
        return
      }
      const meJson = await meRes.json()
      const parsed = meSchema.safeParse(meJson)
      setRole(parsed.success ? parsed.data.role : null)
    })

    return () => {
      cancelled = true
      listener?.subscription.unsubscribe()
    }
  }, [workerBaseUrl])

  const value = useMemo<AuthState>(
    () => ({ loading, role, accessToken, userId }),
    [loading, role, accessToken, userId]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

