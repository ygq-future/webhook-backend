import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Webhook, Mail, LogOut } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

const NAV = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/endpoints', label: '子路径', icon: Webhook, end: false },
  { to: '/accounts', label: '邮箱账号', icon: Mail, end: false },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen">
      <aside className="bg-card flex w-56 shrink-0 flex-col border-r">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Webhook className="text-primary h-5 w-5" />
          <span className="font-semibold tracking-tight">转发中心</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }>
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="text-muted-foreground mb-2 px-1 text-xs">已登录：{user}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  )
}
