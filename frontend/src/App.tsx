import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider'
import AuthPage from './pages/AuthPage'
import ClientPage from './pages/ClientPage'
import SalesPage from './pages/SalesPage'
import ManagerPage from './pages/ManagerPage'
import NotFound from './pages/NotFound'
import RequireRole from './auth/RequireRole'

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <AuthPage /> },
  {
    path: '/app/client',
    element: (
      <RequireRole role="client">
        <ClientPage />
      </RequireRole>
    )
  },
  {
    path: '/app/sales',
    element: (
      <RequireRole role="sales">
        <SalesPage />
      </RequireRole>
    )
  },
  {
    path: '/app/manager',
    element: (
      <RequireRole role="manager">
        <ManagerPage />
      </RequireRole>
    )
  },
  { path: '*', element: <NotFound /> }
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
