import { Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/layout'
import { useAuth } from '@/lib/auth'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Endpoints from '@/pages/Endpoints'
import Accounts from '@/pages/Accounts'
import Logs from '@/pages/Logs'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="text-muted-foreground flex min-h-screen items-center justify-center">加载中…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/endpoints"
        element={
          <Protected>
            <Endpoints />
          </Protected>
        }
      />
      <Route
        path="/accounts"
        element={
          <Protected>
            <Accounts />
          </Protected>
        }
      />
      <Route
        path="/logs"
        element={
          <Protected>
            <Logs />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
