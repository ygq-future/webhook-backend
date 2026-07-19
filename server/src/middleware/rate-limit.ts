import type { Context, Next } from 'hono'

/**
 * 轻量内存限流器（固定窗口，按 key 计数）。
 * 用于保护公开的 Webhook 入口免受突发滥用；单进程内有效。
 * 可通过环境变量调整：
 *   RATE_LIMIT_WINDOW_MS（默认 60000）
 *   RATE_LIMIT_MAX（默认 120，每窗口每 key 最大请求数）
 * 参考设计文档 §13 M7（限流）
 */

const WINDOW_MS = Number(Bun.env.RATE_LIMIT_WINDOW_MS ?? 60_000)
const MAX = Number(Bun.env.RATE_LIMIT_MAX ?? 120)

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** 惰性清理过期桶，避免长时间运行内存增长 */
function sweep(now: number) {
  if (buckets.size < 1024) return
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
}

/** 取客户端标识：优先反代头，回退连接地址 */
function clientKey(c: Context): string {
  const fwd = c.req.header('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  const real = c.req.header('x-real-ip')
  if (real) return real
  // Bun 通过 c.env.server 暴露 requestIP
  const info = (c.env as { server?: { requestIP?: (r: Request) => { address?: string } | null } } | undefined)?.server
  return info?.requestIP?.(c.req.raw)?.address ?? 'unknown'
}

/** 限流中间件工厂。scope 用于区分不同入口的计数空间。 */
export function rateLimit(scope = 'default') {
  return async (c: Context, next: Next) => {
    if (MAX <= 0) return next() // 显式关闭
    const now = Date.now()
    sweep(now)

    const key = `${scope}:${clientKey(c)}`
    let b = buckets.get(key)
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + WINDOW_MS }
      buckets.set(key, b)
    }
    b.count++

    const remaining = Math.max(0, MAX - b.count)
    c.header('X-RateLimit-Limit', String(MAX))
    c.header('X-RateLimit-Remaining', String(remaining))
    c.header('X-RateLimit-Reset', String(Math.ceil(b.resetAt / 1000)))

    if (b.count > MAX) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: 'too many requests', retryAfter }, 429)
    }
    return next()
  }
}

/** 测试辅助：清空所有计数 */
export function _resetRateLimit() {
  buckets.clear()
}
