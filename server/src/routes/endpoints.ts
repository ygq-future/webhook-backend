import { forwardTargetSchema, parserSchema } from '@wh/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { getRepos } from '../db'
import type { EndpointCreate, EndpointRow, EndpointUpdate } from '../db/types'
import { requireAuth } from '../middleware/auth'
import { encryptSecret } from '../services/crypto'

/**
 * 子路径端点管理路由（挂载于 /api/endpoints，需登录）。
 * 提供 CRUD + 启停切换。HMAC 密钥入库加密、出库脱敏。
 * 参考设计文档 §7 / §9 Admin API
 */
export const endpointsRouter = new Hono()
endpointsRouter.use('*', requireAuth)

/* ---------------- 输入校验（放宽 hmac secret，支持"留空=不变"） ---------------- */
const inputAuthSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({
    type: z.literal('hmac'),
    header: z.string().min(1),
    scheme: z.enum(['hex', 'base64', 'prefix', 'scheme']),
    signData: z.enum(['raw-body', 'raw-body+ts', 'query', 'header']),
    algorithm: z.enum(['sha256', 'sha1', 'sha512']).default('sha256'),
    prefix: z.string().optional(),
    schemeKeyword: z.string().optional(),
    timestampHeader: z.string().optional(),
    tolerance: z.number().int().positive().optional(),
    // 明文密钥；create 必填、update 留空表示沿用旧值
    secretRef: z.string().optional().default(''),
  }),
])

const endpointInputSchema = z.object({
  subpath: z.string().regex(/^[a-z0-9-_]+$/, '仅允许小写字母/数字/-/_'),
  title: z.string().min(1),
  description: z.string().optional(),
  active: z.boolean().default(true),
  methods: z.array(z.string()).min(1).default(['POST']),
  parser: parserSchema.optional(),
  auth: inputAuthSchema.default({ type: 'none' }),
  targets: z.array(forwardTargetSchema).min(1),
})
const endpointPatchSchema = endpointInputSchema.partial()

type InputAuth = z.infer<typeof inputAuthSchema>

/** 入库前处理鉴权：hmac 明文密钥加密；留空则沿用旧密文 */
function toStoredAuth(incoming: InputAuth, existing?: EndpointRow['auth']): EndpointRow['auth'] {
  if (incoming.type !== 'hmac') return incoming
  const secret = incoming.secretRef?.trim()
  if (secret) return { ...incoming, secretRef: encryptSecret(secret) }
  const prev = existing as { type?: string; secretRef?: string } | undefined
  if (prev?.type === 'hmac' && prev.secretRef) return { ...incoming, secretRef: prev.secretRef }
  throw new Error('hmac secret required')
}

/** 出库脱敏：不返回 hmac 密文 */
function redactEndpoint(ep: EndpointRow): EndpointRow {
  const auth = ep.auth as { type?: string }
  if (auth?.type === 'hmac') {
    return { ...ep, auth: { ...(ep.auth as object), secretRef: '' } }
  }
  return ep
}

/* ---------------- 路由 ---------------- */
endpointsRouter.get('/', async c => {
  const repos = await getRepos()
  const list = await repos.endpoints.list()
  return c.json(list.map(redactEndpoint))
})

endpointsRouter.get('/:id', async c => {
  const id = Number(c.req.param('id'))
  const repos = await getRepos()
  const ep = await repos.endpoints.get(id)
  if (!ep) return c.json({ error: 'not found' }, 404)
  return c.json(redactEndpoint(ep))
})

endpointsRouter.post('/', async c => {
  const body = await c.req.json().catch(() => null)
  const parsed = endpointInputSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid input', issues: parsed.error.issues }, 400)

  const repos = await getRepos()
  const dup = await repos.endpoints.getBySubpath(parsed.data.subpath)
  if (dup) return c.json({ error: `subpath "${parsed.data.subpath}" already exists` }, 409)

  let auth: EndpointRow['auth']
  try {
    auth = toStoredAuth(parsed.data.auth)
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'invalid auth' }, 400)
  }

  const data: EndpointCreate = {
    subpath: parsed.data.subpath,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    active: parsed.data.active,
    methods: parsed.data.methods,
    parser: parsed.data.parser ?? null,
    auth,
    targets: parsed.data.targets,
  }
  const created = await repos.endpoints.create(data)
  return c.json(redactEndpoint(created), 201)
})

endpointsRouter.put('/:id', async c => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  const parsed = endpointPatchSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid input', issues: parsed.error.issues }, 400)

  const repos = await getRepos()
  const existing = await repos.endpoints.get(id)
  if (!existing) return c.json({ error: 'not found' }, 404)

  // subpath 变更需检查唯一
  if (parsed.data.subpath && parsed.data.subpath !== existing.subpath) {
    const dup = await repos.endpoints.getBySubpath(parsed.data.subpath)
    if (dup) return c.json({ error: `subpath "${parsed.data.subpath}" already exists` }, 409)
  }

  const patch: EndpointUpdate = {}
  if (parsed.data.subpath !== undefined) patch.subpath = parsed.data.subpath
  if (parsed.data.title !== undefined) patch.title = parsed.data.title
  if (parsed.data.description !== undefined) patch.description = parsed.data.description ?? null
  if (parsed.data.active !== undefined) patch.active = parsed.data.active
  if (parsed.data.methods !== undefined) patch.methods = parsed.data.methods
  if (parsed.data.parser !== undefined) patch.parser = parsed.data.parser ?? null
  if (parsed.data.targets !== undefined) patch.targets = parsed.data.targets
  if (parsed.data.auth !== undefined) {
    try {
      patch.auth = toStoredAuth(parsed.data.auth, existing.auth)
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'invalid auth' }, 400)
    }
  }

  const updated = await repos.endpoints.update(id, patch)
  if (!updated) return c.json({ error: 'not found' }, 404)
  return c.json(redactEndpoint(updated))
})

endpointsRouter.patch('/:id/toggle', async c => {
  const id = Number(c.req.param('id'))
  const repos = await getRepos()
  const existing = await repos.endpoints.get(id)
  if (!existing) return c.json({ error: 'not found' }, 404)
  const updated = await repos.endpoints.update(id, { active: !existing.active })
  return c.json(redactEndpoint(updated!))
})

endpointsRouter.delete('/:id', async c => {
  const id = Number(c.req.param('id'))
  const repos = await getRepos()
  const ok = await repos.endpoints.remove(id)
  if (!ok) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})
