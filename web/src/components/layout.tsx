import { useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Webhook, Mail, ScrollText, LogOut, Menu, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

const NAV = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/endpoints', label: '子路径', icon: Webhook, end: false },
  { to: '/logs', label: '入站日志', icon: ScrollText, end: false },
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
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [drawerOffset, setDrawerOffset] = useState(0)
  const [draggingDrawer, setDraggingDrawer] = useState(false)
  const drawerTouch = useRef<{ pointerId: number; startX: number } | null>(null)

  function closeMobileMenu() {
    drawerTouch.current = null
    setDrawerOffset(0)
    setDraggingDrawer(false)
    setMobileOpen(false)
  }

  function handleDrawerPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'touch') return
    drawerTouch.current = { pointerId: e.pointerId, startX: e.clientX }
    setDraggingDrawer(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleDrawerPointerMove(e: React.PointerEvent<HTMLElement>) {
    const touch = drawerTouch.current
    if (!touch || touch.pointerId !== e.pointerId) return
    setDrawerOffset(Math.min(0, e.clientX - touch.startX))
  }

  function handleDrawerPointerEnd(e: React.PointerEvent<HTMLElement>) {
    const touch = drawerTouch.current
    if (!touch || touch.pointerId !== e.pointerId) return
    const moved = e.clientX - touch.startX
    drawerTouch.current = null
    setDraggingDrawer(false)
    setDrawerOffset(0)
    if (moved < -72) setMobileOpen(false)
  }

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
      <div className="glass fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 rounded-none px-3 md:hidden">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="打开菜单">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Webhook className="text-primary h-5 w-5" />
          <span className="font-semibold tracking-tight">转发中心</span>
        </div>
      </div>

      {/* 移动端：抽屉（始终挂载，用 transform/opacity 过渡，滑入 + 遮罩淡入） */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={closeMobileMenu}
        aria-hidden
      />
      <aside
        className={cn(
          'glass fixed top-0 left-0 z-50 flex h-full w-64 touch-pan-y flex-col rounded-none transition-transform duration-300 ease-out md:hidden',
          mobileOpen ? '' : '-translate-x-full',
          draggingDrawer && 'transition-none',
        )}
        onPointerDown={handleDrawerPointerDown}
        onPointerMove={handleDrawerPointerMove}
        onPointerUp={handleDrawerPointerEnd}
        onPointerCancel={handleDrawerPointerEnd}
        style={mobileOpen ? { transform: `translateX(${drawerOffset}px)` } : undefined}>
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-2">
            <Webhook className="text-primary h-5 w-5" />
            <span className="font-semibold tracking-tight">转发中心</span>
          </div>
          <Button variant="ghost" size="icon" onClick={closeMobileMenu} aria-label="关闭菜单">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <NavList onNavigate={closeMobileMenu} />
        <UserFooter
          onLogout={() => {
            closeMobileMenu()
            void handleLogout()
          }}
        />
      </aside>

      <main className="flex-1 overflow-x-hidden pt-14 md:pt-0">
        <div
          key={location.pathname}
          className="animate-in fade-in-0 slide-in-from-bottom-1 mx-auto max-w-5xl px-4 py-6 duration-300 sm:px-6 sm:py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
