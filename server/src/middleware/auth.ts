import type { MiddlewareHandler } from 'hono'
import { readSession } from '../services/session'

/**
 * 管理 API 鉴权中间件：无有效会话则 401。
 * 挂载于 endpoints / accounts / stats 等受保护路由。
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = await readSession(c)
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  c.set('user', user)
  await next()
}
