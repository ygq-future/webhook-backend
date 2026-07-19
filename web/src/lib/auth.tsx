import * as React from 'react'
import { authApi } from './api'

interface AuthState {
  user: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = React.createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    authApi
      .me()
      .then(r => setUser(r.authenticated ? (r.user ?? 'admin') : null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = React.useCallback(async (username: string, password: string) => {
    const r = await authApi.login(username, password)
    setUser(r.user)
  }, [])

  const logout = React.useCallback(async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
