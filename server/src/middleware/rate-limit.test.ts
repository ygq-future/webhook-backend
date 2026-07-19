import { describe, expect, it, beforeEach } from 'bun:test'
import { Hono } from 'hono'
import { rateLimit, _resetRateLimit } from './rate-limit'

/**
 * 限流中间件测试。默认 MAX=120/60s；此处只验证计数、429 与响应头语义。
 * 通过固定 x-forwarded-for 模拟同一客户端。
 */
describe('rateLimit', () => {
  beforeEach(() => _resetRateLimit())

  function app() {
    const a = new Hono()
    a.use('/hit', rateLimit('test'))
    a.get('/hit', c => c.text('ok'))
    return a
  }

  const headers = { 'x-forwarded-for': '203.0.113.7' }

  it('放行窗口内请求并递减 Remaining', async () => {
    const a = app()
    const r1 = await a.request('/hit', { headers })
    expect(r1.status).toBe(200)
    expect(r1.headers.get('X-RateLimit-Limit')).toBe('120')
    const rem1 = Number(r1.headers.get('X-RateLimit-Remaining'))

    const r2 = await a.request('/hit', { headers })
    const rem2 = Number(r2.headers.get('X-RateLimit-Remaining'))
    expect(rem2).toBe(rem1 - 1)
  })

  it('超过上限返回 429 且带 Retry-After', async () => {
    const a = app()
    let last: Response | undefined
    for (let i = 0; i < 121; i++) last = await a.request('/hit', { headers })
    expect(last!.status).toBe(429)
    expect(Number(last!.headers.get('Retry-After'))).toBeGreaterThan(0)
    const body = (await last!.json()) as { error: string }
    expect(body.error).toBe('too many requests')
  })

  it('不同客户端各自独立计数', async () => {
    const a = app()
    for (let i = 0; i < 121; i++) await a.request('/hit', { headers })
    // 另一 IP 仍应放行
    const other = await a.request('/hit', { headers: { 'x-forwarded-for': '198.51.100.9' } })
    expect(other.status).toBe(200)
  })
})
