import type { EndpointAuth, ForwardTarget, Parser } from '@wh/shared'

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
  methods: string[]
  parser: Parser | null
  /** 存储态 auth：hmac 时其 secret 以 secretEnc 字段加密存放 */
  auth: EndpointAuth | Record<string, unknown>
  targets: ForwardTarget[]
  createdAt: string
  updatedAt: string
}
export type EndpointCreate = Omit<EndpointRow, 'id' | 'createdAt' | 'updatedAt'>
export type EndpointUpdate = Partial<Omit<EndpointRow, 'id' | 'createdAt' | 'updatedAt'>>

/* ---------------- 转发日志 ---------------- */
export interface LogRow {
  id: number
  endpointId: number | null
  channel: string | null
  target: string | null
  status: 'success' | 'failed'
  error: string | null
  createdAt: string
}
export type LogCreate = Omit<LogRow, 'id' | 'createdAt'>

export interface LogFilter {
  endpointId?: number
  status?: 'success' | 'failed'
  limit?: number
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
    stats(): Promise<Stats>
  }
  close(): Promise<void>
}
