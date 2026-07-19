import { Hono } from 'hono'
import { z } from 'zod'
import { safeEqual, verifyPassword } from '../services/crypto'
import { clearSession, createSession, readSession } from '../services/session'

/**
 * 管理员认证路由（挂载于 /api/auth，公开）。
 * 凭据来源（优先级）：ADMIN_PASSWORD_HASH（scrypt）> ADMIN_PASSWORD（明文）。
 * 默认账号 admin / admin123（仅开发用，生产必须覆盖）。
 * 参考设计文档 §11
 */
export const authRouter = new Hono()

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

function checkCredentials(username: string, password: string): boolean {
  const expectedUser = Bun.env.ADMIN_USER ?? 'admin'
  const userOk = safeEqual(username, expectedUser)

  const hash = Bun.env.ADMIN_PASSWORD_HASH
  const passOk = hash ? verifyPassword(password, hash) : safeEqual(password, Bun.env.ADMIN_PASSWORD ?? 'admin123')

  return userOk && passOk
}

authRouter.post('/login', async c => {
  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid input' }, 400)

  if (!checkCredentials(parsed.data.username, parsed.data.password)) {
    return c.json({ error: 'invalid credentials' }, 401)
  }

  await createSession(c, parsed.data.username)
  return c.json({ ok: true, user: parsed.data.username })
})

authRouter.post('/logout', c => {
  clearSession(c)
  return c.json({ ok: true })
})

authRouter.get('/me', async c => {
  const user = await readSession(c)
  if (!user) return c.json({ authenticated: false })
  return c.json({ authenticated: true, user })
})
