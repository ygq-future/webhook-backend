import { z } from 'zod'

/* =========================================================
 * 渠道类型
 * 参考设计文档 §5.2 / ForwardChannel
 * =======================================================*/
export const channelTypeSchema = z.enum(['email', 'http'])
export type ChannelType = z.infer<typeof channelTypeSchema>

/* =========================================================
 * 通用 HMAC 验签配置（入站）
 * 参考设计文档 §5.1.1
 * =======================================================*/
export const hmacSchemeSchema = z.enum(['hex', 'base64', 'prefix', 'scheme'])
export const hmacAlgorithmSchema = z.enum(['sha256', 'sha1', 'sha512'])

export const hmacAuthSchema = z.object({
  type: z.literal('hmac'),
  /** 携带签名的请求头，如 X-Signature / X-Hub-Signature-256 / Authorization */
  header: z.string().min(1),
  /** 签名编码方案 */
  scheme: hmacSchemeSchema,
  /** 被签名的数据：原始 body / body+时间戳 / query / 指定 header */
  signData: z.enum(['raw-body', 'raw-body+ts', 'query', 'header']),
  /** 哈希算法（默认 sha256） */
  algorithm: hmacAlgorithmSchema.default('sha256'),
  /** 带前缀方案时的前缀，如 "sha256="（scheme=prefix 时必填） */
  prefix: z.string().optional(),
  /** 带 scheme 方案时的关键字，如 "HMAC" / "Bearer"（scheme=scheme 时必填） */
  schemeKeyword: z.string().optional(),
  /** 防重放：时间戳头名 */
  timestampHeader: z.string().optional(),
  /** 防重放：容差（秒） */
  tolerance: z.number().int().positive().optional(),
  /** 密钥引用（运行时由环境变量/加密存储提供，此处仅描述结构） */
  secretRef: z.string().min(1),
})
export type HmacAuth = z.infer<typeof hmacAuthSchema>

export const endpointAuthSchema = z.discriminatedUnion('type', [z.object({ type: z.literal('none') }), hmacAuthSchema])
export type EndpointAuth = z.infer<typeof endpointAuthSchema>

/* =========================================================
 * 入站解析（parser）：把任意入站请求归一为命名变量
 * 参考设计文档 §5.1 / 自定义请求体接收结构
 * =======================================================*/
export const parserSchema = z.object({
  /** 从哪里取负载：请求体 / 查询参数 / 指定请求头 */
  source: z.enum(['body', 'query', 'header']).default('body'),
  /** 内容类型与解析方式 */
  contentType: z.enum(['json', 'form', 'text', 'raw']).default('json'),
  /** 把任意入站字段映射为命名变量，如 { from: 'data.sender', text: 'data.body' } */
  mapping: z.record(z.string(), z.string()).optional(),
})
export type Parser = z.infer<typeof parserSchema>

/* =========================================================
 * 转发目标（ForwardTarget）—— 渠道相关
 * 参考设计文档 §5.2 / ForwardTarget
 * =======================================================*/
export const httpOutAuthSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), token: z.string().min(1) }),
  z.object({ type: z.literal('basic'), username: z.string(), password: z.string() }),
  z.object({
    type: z.literal('hmac'),
    header: z.string(),
    scheme: hmacSchemeSchema,
    prefix: z.string().optional(),
    schemeKeyword: z.string().optional(),
    secretRef: z.string().min(1),
  }),
])
export type HttpOutAuth = z.infer<typeof httpOutAuthSchema>

export const emailTargetSchema = z.object({
  channel: z.literal('email'),
  /** 是否启用此转发目标；旧配置缺省视为启用 */
  active: z.boolean().default(true),
  /** 使用的邮箱账号 id */
  accountId: z.string().min(1),
  to: z.string().min(1),
  subjectTpl: z.string().default('Webhook 通知'),
  bodyTpl: z.string().default('{{event}}'),
  format: z.enum(['text', 'html']).default('text'),
})
export type EmailTarget = z.infer<typeof emailTargetSchema>

export const httpTargetSchema = z.object({
  channel: z.literal('http'),
  /** 是否启用此转发目标；旧配置缺省视为启用 */
  active: z.boolean().default(true),
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  headers: z.record(z.string(), z.string()).optional(),
  /** 抽取表达式（dot-path）：从入站事件取要转发的子树，如 data.message / payload.items[0] */
  bodyExpr: z.string().optional(),
  /** 与 bodyExpr 二选一/组合：用 {{var}} 包成自定义结构 */
  bodyTpl: z.string().optional(),
  contentType: z.enum(['json', 'form', 'text']).default('json'),
  auth: httpOutAuthSchema.default({ type: 'none' }),
  timeoutMs: z.number().int().positive().default(10000),
  retries: z.number().int().nonnegative().default(3),
  /** 可选 HTTP/HTTPS 代理：出站请求经此代理转发（公司出口/网关场景） */
  proxy: z.string().url().optional(),
})
export type HttpTarget = z.infer<typeof httpTargetSchema>

export const forwardTargetSchema = z.discriminatedUnion('channel', [emailTargetSchema, httpTargetSchema])
export type ForwardTarget = z.infer<typeof forwardTargetSchema>

/* =========================================================
 * 入站响应模式（reply）：校验请求后直接返回，不进入转发引擎
 * =======================================================*/
export const endpointReplySchema = z.object({
  status: z.number().int().min(200).max(599).default(200),
  contentType: z.enum(['json', 'text']).default('json'),
  body: z.string().min(1).default('{"ok":true}'),
})
export type EndpointReply = z.infer<typeof endpointReplySchema>

/* =========================================================
 * 子路径端点（Endpoint）
 * 参考设计文档 §7 / endpoints 表
 * =======================================================*/
export const endpointSchema = z
  .object({
    id: z.number().int().positive().optional(),
    subpath: z.string().regex(/^[a-z0-9-_]+$/, '仅允许小写字母/数字/-/_'),
    title: z.string().min(1),
    description: z.string().optional(),
    active: z.boolean().default(true),
    mode: z.enum(['forward', 'reply']).default('forward'),
    /** 允许的方法：["*"] 表示任意 */
    methods: z.array(z.string()).min(1).default(['POST']),
    parser: parserSchema.optional(),
    auth: endpointAuthSchema.default({ type: 'none' }),
    targets: z.array(forwardTargetSchema).default([]),
    reply: endpointReplySchema.optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .superRefine((endpoint, ctx) => {
    if (endpoint.mode === 'forward' && endpoint.targets.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['targets'], message: '转发模式至少需要一个转发目标' })
    }
    if (endpoint.mode === 'reply' && !endpoint.reply) {
      ctx.addIssue({ code: 'custom', path: ['reply'], message: '响应模式需要配置响应内容' })
    }
  })
export type Endpoint = z.infer<typeof endpointSchema>

/* =========================================================
 * 邮箱账号（EmailAccount）
 * 参考设计文档 §7 / email_accounts 表
 * =======================================================*/
export const emailAccountSchema = z.object({
  id: z.number().int().positive().optional(),
  channel: z.literal('email'),
  name: z.string().min(1),
  /** 渠道：gmail / qq / 163 */
  provider: z.enum(['gmail', 'qq', '163']),
  email: z.string().email(),
  /** 授权码/应用专用密码（明文入参，落库加密） */
  authCode: z.string().min(1),
  fromName: z.string().optional(),
  createdAt: z.string().optional(),
})
export type EmailAccount = z.infer<typeof emailAccountSchema>
