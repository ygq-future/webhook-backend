import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { getRepos } from './db'
import { accountsRouter } from './routes/accounts'
import { authRouter } from './routes/auth'
import { endpointsRouter } from './routes/endpoints'
import { statsRouter } from './routes/stats'
import { webhookRouter } from './routes/webhook'

/**
 * 服务入口：装配所有路由 + 生产环境静态托管。
 * 路由分层：
 *   /api/health        健康检查（公开）
 *   /wh/:subpath       入站 Webhook 接收（公开，任意方法）
 *   /api/auth/*        管理员登录/登出/会话（公开）
 *   /api/endpoints/*   子路径端点管理（需登录）
 *   /api/accounts/*    邮箱账号管理（需登录）
 *   /api/stats/*       仪表盘统计（需登录）
 *   /*                 SPA 前端静态资源（web/dist，生产）
 */
const app = new Hono()

app.get('/api/health', c => c.json({ status: 'ok', ts: new Date().toISOString() }))

// 公开：Webhook 接收 + 认证
app.route('/wh', webhookRouter)
app.route('/api/auth', authRouter)

// 受保护：各路由内部已 use(requireAuth)
app.route('/api/endpoints', endpointsRouter)
app.route('/api/accounts', accountsRouter)
app.route('/api/stats', statsRouter)

// 生产静态资源 + SPA 回退（dev 由 Vite 提供，不走这里）
const WEB_ROOT = Bun.env.WEB_ROOT ?? './web/dist'
app.use('/*', serveStatic({ root: WEB_ROOT }))
app.get('*', serveStatic({ path: `${WEB_ROOT}/index.html` }))

// 启动时预热数据库（建表 / 连接）
await getRepos()

const port = Number(Bun.env.PORT ?? 3000)
Bun.serve({ fetch: app.fetch, port, idleTimeout: 30 })
console.log(`[server] listening on http://localhost:${port}`)
