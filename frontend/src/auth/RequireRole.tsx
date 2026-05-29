import { Navigate } from 'react-router-dom'
import { useAuth, type UserRole } from './AuthProvider'

export default function RequireRole({
  role,
  children
}: {
  role: UserRole
  children: React.ReactNode
}) {
  const { loading, role: currentRole } = useAuth()

  if (loading) return <div className="p-4">Loading…</div>
  if (!currentRole) return <Navigate to="/login" replace />
  if (currentRole !== role) return <div className="p-4">Not authorized.</div>

  return <>{children}</>
}

