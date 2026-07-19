import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Webhook, Mail, LogOut, Menu, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

const NAV = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/endpoints', label: '子路径', icon: Webhook, end: false },
  { to: '/accounts', label: '邮箱账号', icon: Mail, end: false },
]

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-2 p-3">
      {NAV.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
              isActive ? 'bg-white/10 text-white' : 'text-muted-foreground hover:bg-white/5 hover:text-white',
            )
          }>
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function UserFooter({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth()
  return (
    <div className="border-t border-white/10 p-3">
      <div className="text-muted-foreground mb-2 px-1 text-xs">已登录：{user}</div>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onLogout}>
        <LogOut className="h-4 w-4" />
        退出登录
      </Button>
    </div>
  )
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen">
      {/* 桌面端：固定侧边栏 */}
      <aside className="glass hidden w-56 shrink-0 flex-col rounded-none md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-4">
          <Webhook className="text-primary h-5 w-5" />
          <span className="font-semibold tracking-tight">转发中心</span>
        </div>
        <NavList />
        <UserFooter onLogout={handleLogout} />
      </aside>

      {/* 移动端：顶部栏 */}
      <div className="glass fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between rounded-none px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Webhook className="text-primary h-5 w-5" />
          <span className="font-semibold tracking-tight">转发中心</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="打开菜单">
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* 移动端：抽屉 */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="glass fixed top-0 left-0 z-50 flex h-full w-64 flex-col rounded-none md:hidden">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <div className="flex items-center gap-2">
                <Webhook className="text-primary h-5 w-5" />
                <span className="font-semibold tracking-tight">转发中心</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="关闭菜单">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <NavList onNavigate={() => setMobileOpen(false)} />
            <UserFooter
              onLogout={() => {
                setMobileOpen(false)
                void handleLogout()
              }}
            />
          </aside>
        </>
      )}

      <main className="flex-1 overflow-x-hidden pt-14 md:pt-0">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  )
}
