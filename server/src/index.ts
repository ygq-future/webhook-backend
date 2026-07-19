import { Hono } from 'hono'

const app = new Hono()

app.get('/api/health', c => c.json({ status: 'ok', ts: new Date().toISOString() }))

// 后续里程碑挂载点（M3 接收 / M5 Admin API）：
//   app.route('/api', apiRouter)

const port = Number(Bun.env.PORT ?? 3000)
Bun.serve({ fetch: app.fetch, port, idleTimeout: 30 })
console.log(`[server] listening on http://localhost:${port}`)
