import type { EndpointAuth, EndpointReply, ForwardTarget, Parser } from '@wh/shared'

/**
 * 数据访问层（DAL）类型与统一接口
 * 业务层只依赖此接口，不感知底层是 SQLite 还是 PostgreSQL。
 * 参考设计文档 §5.5 / §7
 */

/* ---------------- 邮箱账号 ---------------- */
export interface AccountRow {
  id: number
  channel: string // 目前恒为 'email'
  name: string
  provider: string // 'gmail' | 'qq' | '163'
  email: string
  /** 加密后的授权码（AES-GCM），DAL 不做加解密 */
  secretEnc: string
  fromName: string | null
  host: string
  port: number
  secure: boolean
  /** 可选 SMTP 出站代理（HTTP/HTTPS CONNECT） */
  proxy: string | null
  createdAt: string
}
export type AccountCreate = Omit<AccountRow, 'id' | 'createdAt'>
export type AccountUpdate = Partial<Omit<AccountRow, 'id' | 'createdAt'>>

/* ---------------- 子路径端点 ---------------- */
export interface EndpointRow {
  id: number
  subpath: string
  title: string
  description: string | null
  active: boolean
  mode: 'forward' | 'reply'
  methods: string[]
  parser: Parser | null
  /** 存储态 auth：hmac 时其 secret 以 secretEnc 字段加密存放 */
  auth: EndpointAuth | Record<string, unknown>
  targets: ForwardTarget[]
  reply: EndpointReply | null
  createdAt: string
  updatedAt: string
}
export type EndpointCreate = Omit<EndpointRow, 'id' | 'createdAt' | 'updatedAt'>
export type EndpointUpdate = Partial<Omit<EndpointRow, 'id' | 'createdAt' | 'updatedAt'>>

/* ---------------- 入站日志（一次 Webhook 接收 = 一条） ---------------- */
export interface InboundLogRow {
  id: number
  endpointId: number | null
  subpath: string
  method: string
  /** 入站请求头（小写键对象），存为 JSON 文本 */
  headers: Record<string, string> | null
  /** 入站原始请求体 */
  body: string | null
  /** 接收状态：received=已接收并进入转发流程 */
  status: 'received'
  createdAt: string
}
export type InboundLogCreate = Omit<InboundLogRow, 'id' | 'createdAt'>

/* ---------------- 出站日志（一个入站可对应 N 个出站） ---------------- */
export interface ForwardLogRow {
  id: number
  endpointId: number | null
  /** 关联入站日志（1:N） */
  inboundLogId: number | null
  channel: string | null
  /** 出站目标可读标识（不含敏感信息） */
  target: string | null
  /** 出站请求 */
  requestUrl: string | null
  requestMethod: string | null
  requestHeaders: Record<string, string> | null
  requestBody: string | null
  /** 出站响应 */
  responseStatus: number | null
  responseBody: string | null
  durationMs: number | null
  status: 'success' | 'failed'
  error: string | null
  createdAt: string
}
export type LogRow = ForwardLogRow
export type LogCreate = Omit<
  ForwardLogRow,
  | 'id'
  | 'createdAt'
  | 'inboundLogId'
  | 'requestUrl'
  | 'requestMethod'
  | 'requestHeaders'
  | 'requestBody'
  | 'responseStatus'
  | 'responseBody'
  | 'durationMs'
> & {
  inboundLogId?: number | null
  requestUrl?: string | null
  requestMethod?: string | null
  requestHeaders?: Record<string, string> | null
  requestBody?: string | null
  responseStatus?: number | null
  responseBody?: string | null
  durationMs?: number | null
}

export interface LogFilter {
  endpointId?: number
  status?: 'success' | 'failed'
  limit?: number
}

export interface InboundLogFilter {
  endpointId?: number
  limit?: number
}

/** 入站 + 其全部出站（1:N） */
export interface InboundWithOutbound {
  inbound: InboundLogRow
  outbound: ForwardLogRow[]
}

export interface Stats {
  endpoints: number
  accounts: number
  success: number
  failed: number
  recent: LogRow[]
}

/* ---------------- 统一仓储接口 ---------------- */
export interface Repos {
  accounts: {
    list(): Promise<AccountRow[]>
    get(id: number): Promise<AccountRow | null>
    create(data: AccountCreate): Promise<AccountRow>
    update(id: number, data: AccountUpdate): Promise<AccountRow | null>
    remove(id: number): Promise<boolean>
  }
  endpoints: {
    list(): Promise<EndpointRow[]>
    get(id: number): Promise<EndpointRow | null>
    getBySubpath(subpath: string): Promise<EndpointRow | null>
    create(data: EndpointCreate): Promise<EndpointRow>
    update(id: number, data: EndpointUpdate): Promise<EndpointRow | null>
    remove(id: number): Promise<boolean>
  }
  logs: {
    list(filter?: LogFilter): Promise<LogRow[]>
    add(entry: LogCreate): Promise<void>
    /** 写入一条入站日志，返回自增 id（供出站日志关联） */
    addInbound(entry: InboundLogCreate): Promise<number>
    /** 列出入站日志及其全部出站日志（1:N） */
    listInbound(filter?: InboundLogFilter): Promise<InboundWithOutbound[]>
    stats(): Promise<Stats>
  }
  close(): Promise<void>
}
