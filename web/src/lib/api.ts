/**
 * 后端 API 客户端。
 * 统一走同源 `/api/*`（dev 由 Vite 代理到后端，生产由后端静态托管同源）。
 * 所有请求携带 Cookie（credentials: 'include'）以维持会话。
 */

export interface ApiError extends Error {
  status: number
  detail?: unknown
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || `HTTP ${res.status}`) as ApiError
    err.status = res.status
    err.detail = data
    throw err
  }
  return data as T
}

/* ---------------- 类型（与后端保持一致） ---------------- */
export interface Stats {
  endpoints: number
  accounts: number
  success: number
  failed: number
  recent: LogRow[]
}

export interface LogRow {
  id: number
  endpointId: number | null
  inboundLogId: number | null
  channel: string | null
  target: string | null
  requestUrl: string | null
  requestMethod: string | null
  requestHeaders: Record<string, string> | null
  requestBody: string | null
  responseStatus: number | null
  responseBody: string | null
  durationMs: number | null
  status: 'success' | 'failed'
  error: string | null
  createdAt: string
}

export interface InboundLogRow {
  id: number
  endpointId: number | null
  subpath: string
  method: string
  headers: Record<string, string> | null
  body: string | null
  status: 'received'
  createdAt: string
}

export interface InboundWithOutbound {
  inbound: InboundLogRow
  outbound: LogRow[]
}

export interface Parser {
  source: 'body' | 'query' | 'header'
  contentType: 'json' | 'form' | 'text' | 'raw'
  mapping?: Record<string, string>
}

export type EndpointAuth =
  | { type: 'none' }
  | {
      type: 'hmac'
      header: string
      scheme: 'hex' | 'base64' | 'prefix' | 'scheme'
      signData: 'raw-body' | 'raw-body+ts' | 'query' | 'header'
      algorithm?: 'sha256' | 'sha1' | 'sha512'
      prefix?: string
      schemeKeyword?: string
      timestampHeader?: string
      tolerance?: number
      secretRef?: string
    }

export type HttpOutAuth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'hmac'; header: string; scheme: 'hex' | 'base64' | 'prefix' | 'scheme'; secretRef: string }

export interface EmailTarget {
  channel: 'email'
  accountId: string
  to: string
  subjectTpl?: string
  bodyTpl?: string
  format?: 'text' | 'html'
}

export interface HttpTarget {
  channel: 'http'
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  bodyExpr?: string
  bodyTpl?: string
  contentType?: 'json' | 'form' | 'text'
  auth?: HttpOutAuth
  timeoutMs?: number
  retries?: number
}

export type ForwardTarget = EmailTarget | HttpTarget

export interface EndpointRow {
  id: number
  subpath: string
  title: string
  description: string | null
  active: boolean
  methods: string[]
  parser: Parser | null
  auth: EndpointAuth | Record<string, unknown>
  targets: ForwardTarget[]
  createdAt: string
  updatedAt: string
}

export interface AccountRow {
  id: number
  channel: string
  name: string
  provider: 'gmail' | 'qq' | '163'
  email: string
  fromName: string | null
  host: string
  port: number
  secure: boolean
  createdAt: string
  hasSecret: boolean
}

/* ---------------- 鉴权 ---------------- */
export const authApi = {
  me: () => request<{ authenticated: boolean; user?: string }>('/auth/me'),
  login: (username: string, password: string) =>
    request<{ ok: boolean; user: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
}

/* ---------------- 统计 ---------------- */
export const statsApi = {
  get: () => request<Stats>('/stats'),
  logs: (params?: { endpointId?: number; status?: 'success' | 'failed'; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.endpointId) q.set('endpointId', String(params.endpointId))
    if (params?.status) q.set('status', params.status)
    if (params?.limit) q.set('limit', String(params.limit))
    const qs = q.toString()
    return request<LogRow[]>(`/stats/logs${qs ? `?${qs}` : ''}`)
  },
  /** 入站日志 + 其全部出站日志（1:N） */
  inbound: (params?: { endpointId?: number; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.endpointId) q.set('endpointId', String(params.endpointId))
    if (params?.limit) q.set('limit', String(params.limit))
    const qs = q.toString()
    return request<InboundWithOutbound[]>(`/stats/inbound${qs ? `?${qs}` : ''}`)
  },
}

/* ---------------- 端点 ---------------- */
export const endpointsApi = {
  list: () => request<EndpointRow[]>('/endpoints'),
  get: (id: number) => request<EndpointRow>(`/endpoints/${id}`),
  create: (data: unknown) => request<EndpointRow>('/endpoints', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) =>
    request<EndpointRow>(`/endpoints/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggle: (id: number) => request<EndpointRow>(`/endpoints/${id}/toggle`, { method: 'PATCH' }),
  remove: (id: number) => request<{ ok: boolean }>(`/endpoints/${id}`, { method: 'DELETE' }),
}

/* ---------------- 账号 ---------------- */
export const accountsApi = {
  list: () => request<AccountRow[]>('/accounts'),
  create: (data: unknown) => request<AccountRow>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: unknown) =>
    request<AccountRow>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: number) => request<{ ok: boolean }>(`/accounts/${id}`, { method: 'DELETE' }),
}
