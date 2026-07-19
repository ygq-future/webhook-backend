import { Hono } from 'hono'
import { getRepos } from '../db'
import { requireAuth } from '../middleware/auth'

/**
 * 仪表盘统计路由（挂载于 /api/stats，需登录）。
 * 返回端点数 / 账号数 / 成功失败计数 / 最近日志。
 * 参考设计文档 §9
 */
export const statsRouter = new Hono()
statsRouter.use('*', requireAuth)

statsRouter.get('/', async c => {
  const repos = await getRepos()
  const stats = await repos.logs.stats()
  return c.json(stats)
})

statsRouter.get('/logs', async c => {
  const repos = await getRepos()
  const endpointId = c.req.query('endpointId')
  const status = c.req.query('status') as 'success' | 'failed' | undefined
  const limit = c.req.query('limit')
  const logs = await repos.logs.list({
    endpointId: endpointId ? Number(endpointId) : undefined,
    status: status === 'success' || status === 'failed' ? status : undefined,
    limit: limit ? Number(limit) : undefined,
  })
  return c.json(logs)
})

/** 入站日志及其全部出站日志（1:N），用于「转发日志」页 */
statsRouter.get('/inbound', async c => {
  const repos = await getRepos()
  const endpointId = c.req.query('endpointId')
  const limit = c.req.query('limit')
  const data = await repos.logs.listInbound({
    endpointId: endpointId ? Number(endpointId) : undefined,
    limit: limit ? Number(limit) : undefined,
  })
  return c.json(data)
})
