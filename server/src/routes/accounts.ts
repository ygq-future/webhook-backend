import { Hono } from 'hono'
import { z } from 'zod'
import { getRepos } from '../db'
import type { AccountCreate, AccountRow, AccountUpdate } from '../db/types'
import { requireAuth } from '../middleware/auth'
import { SMTP_PRESETS } from '../services/channels/email'
import { encryptSecret } from '../services/crypto'

/**
 * 邮箱账号管理路由（挂载于 /api/accounts，需登录）。
 * 授权码入库加密、出库脱敏；host/port/secure 缺省取服务商预设，可覆盖。
 * 参考设计文档 §7 / §9
 */
export const accountsRouter = new Hono()
accountsRouter.use('*', requireAuth)

const createSchema = z.object({
  name: z.string().min(1),
  provider: z.enum(['gmail', 'qq', '163']),
  email: z.string().email(),
  authCode: z.string().min(1),
  fromName: z.string().optional(),
  // 高级覆盖（默认取服务商预设）
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  secure: z.boolean().optional(),
  proxy: z
    .string()
    .url()
    .refine(value => ['http:', 'https:'].includes(new URL(value).protocol), '代理仅支持 http:// 或 https://')
    .optional(),
})

const updateSchema = createSchema.partial().extend({
  // 更新时授权码留空表示不变
  authCode: z.string().optional(),
  // 更新时传 null 可清除已配置的代理
  proxy: createSchema.shape.proxy.nullable(),
})

/** 出库脱敏：不返回授权码密文，仅标记是否已配置 */
function redactAccount(a: AccountRow): Omit<AccountRow, 'secretEnc'> & { hasSecret: boolean } {
  const { secretEnc, ...rest } = a
  return { ...rest, hasSecret: Boolean(secretEnc) }
}

accountsRouter.get('/', async c => {
  const repos = await getRepos()
  const list = await repos.accounts.list()
  return c.json(list.map(redactAccount))
})

accountsRouter.get('/:id', async c => {
  const id = Number(c.req.param('id'))
  const repos = await getRepos()
  const a = await repos.accounts.get(id)
  if (!a) return c.json({ error: 'not found' }, 404)
  return c.json(redactAccount(a))
})

accountsRouter.post('/', async c => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid input', issues: parsed.error.issues }, 400)

  const preset = SMTP_PRESETS[parsed.data.provider]
  const data: AccountCreate = {
    channel: 'email',
    name: parsed.data.name,
    provider: parsed.data.provider,
    email: parsed.data.email,
    secretEnc: encryptSecret(parsed.data.authCode),
    fromName: parsed.data.fromName ?? null,
    host: parsed.data.host ?? preset.host,
    port: parsed.data.port ?? preset.port,
    secure: parsed.data.secure ?? preset.secure,
    proxy: parsed.data.proxy ?? null,
  }
  const repos = await getRepos()
  const created = await repos.accounts.create(data)
  return c.json(redactAccount(created), 201)
})

accountsRouter.put('/:id', async c => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid input', issues: parsed.error.issues }, 400)

  const repos = await getRepos()
  const existing = await repos.accounts.get(id)
  if (!existing) return c.json({ error: 'not found' }, 404)

  const patch: AccountUpdate = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.provider !== undefined) patch.provider = parsed.data.provider
  if (parsed.data.email !== undefined) patch.email = parsed.data.email
  if (parsed.data.fromName !== undefined) patch.fromName = parsed.data.fromName ?? null
  if (parsed.data.host !== undefined) patch.host = parsed.data.host
  if (parsed.data.port !== undefined) patch.port = parsed.data.port
  if (parsed.data.secure !== undefined) patch.secure = parsed.data.secure
  if (parsed.data.proxy !== undefined) patch.proxy = parsed.data.proxy || null
  if (parsed.data.authCode && parsed.data.authCode.trim()) {
    patch.secretEnc = encryptSecret(parsed.data.authCode)
  }

  const updated = await repos.accounts.update(id, patch)
  if (!updated) return c.json({ error: 'not found' }, 404)
  return c.json(redactAccount(updated))
})

accountsRouter.delete('/:id', async c => {
  const id = Number(c.req.param('id'))
  const repos = await getRepos()
  const ok = await repos.accounts.remove(id)
  if (!ok) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})
