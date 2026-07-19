import type { HmacAuth } from '@wh/shared'
import { Hono } from 'hono'
import { getRepos } from '../db'
import { decryptSecret } from '../services/crypto'
import { rateLimit } from '../middleware/rate-limit'
import { forwardEvent } from '../services/forward-engine'
import { verifyInboundHmac } from '../services/hmac'

/**
 * 入站 Webhook 接收路由（挂载于 /wh）。
 * 特性：
 * - 接受任意 HTTP 方法（.all），按端点 methods 白名单校验（["*"] 表示任意）
 * - 通用 HMAC-SHA-256 验签（端点 auth.type === 'hmac' 时）
 * - 校验通过后立即 200 应答，转发异步执行（不阻塞来源方）
 * 参考设计文档 §5.1 / §6
 */
export const webhookRouter = new Hono()

// 公开入口：按客户端 IP 限流，抵御突发滥用
webhookRouter.use('/:subpath', rateLimit('webhook'))

/** 收集请求头为小写键的普通对象（HMAC/解析统一使用小写键） */
function collectHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v
  })
  return headers
}

webhookRouter.all('/:subpath', async c => {
  const subpath = c.req.param('subpath')
  const repos = await getRepos()

  const endpoint = await repos.endpoints.getBySubpath(subpath)
  if (!endpoint) return c.json({ error: 'endpoint not found' }, 404)
  if (!endpoint.active) return c.json({ error: 'endpoint disabled' }, 410)

  const method = c.req.method.toUpperCase()
  const allowed = endpoint.methods.map(m => m.toUpperCase())
  if (!allowed.includes('*') && !allowed.includes(method)) {
    return c.json({ error: `method ${method} not allowed` }, 405)
  }

  const raw = await c.req.text()
  const headers = collectHeaders(c.req.raw)
  const query = c.req.query()

  // 验签（可选）
  const auth = endpoint.auth as { type?: string }
  if (auth?.type === 'hmac') {
    const hmac = endpoint.auth as HmacAuth
    let secret: string
    try {
      secret = decryptSecret(hmac.secretRef)
    } catch {
      return c.json({ error: 'server secret misconfigured' }, 500)
    }
    const result = verifyInboundHmac(hmac, { raw, headers, query }, secret)
    if (!result.ok) return c.json({ error: 'unauthorized', reason: result.reason }, 401)
  }

  // 立即应答，异步转发（fire-and-forget；进程内事件循环保证 Promise 继续执行）
  const input = { method, raw, headers, query }
  void forwardEvent(endpoint, input, repos).catch(err => {
    console.error(`[forward] endpoint#${endpoint.id} (${subpath}) error:`, err)
  })

  return c.json({ ok: true, accepted: true }, 200)
})
