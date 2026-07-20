import type {
  AccountCreate,
  AccountRow,
  AccountUpdate,
  EndpointCreate,
  EndpointRow,
  EndpointUpdate,
  InboundLogCreate,
  InboundLogFilter,
  InboundLogPage,
  InboundLogRow,
  LogCreate,
  LogFilter,
  LogRow,
  Repos,
  Stats,
} from './types'
import { redactHeaders } from '../services/redact'

/**
 * PostgreSQL 数据访问层实现（postgres.js）
 * 与 SQLite 实现共用同一 Repos 接口；方言差异（SERIAL / jsonb / boolean / now()）在此隔离。
 * postgres 依赖仅在 DATABASE_URL 指向 postgres 时动态加载，SQLite 部署无需安装。
 * 参考设计文档 §5.5
 */

/* postgres.js 返回的行：jsonb 已解析为 JS 对象，时间为 Date */
interface RawAccount {
  id: number
  channel: string
  name: string
  provider: string
  email: string
  secret_enc: string
  from_name: string | null
  host: string
  port: number
  secure: boolean
  proxy: string | null
  created_at: Date
}

interface RawEndpoint {
  id: number
  subpath: string
  title: string
  description: string | null
  active: boolean
  mode: 'forward' | 'reply' | null
  methods: string[]
  parser: EndpointRow['parser']
  auth: EndpointRow['auth'] | null
  targets: EndpointRow['targets']
  reply: EndpointRow['reply']
  created_at: Date
  updated_at: Date
}

interface RawLog {
  id: number
  endpoint_id: number | null
  inbound_log_id: number | null
  channel: string | null
  target: string | null
  request_url: string | null
  request_method: string | null
  request_headers: Record<string, string> | null
  request_body: string | null
  response_status: number | null
  response_body: string | null
  duration_ms: number | null
  status: string
  error: string | null
  created_at: Date
}

interface RawInbound {
  id: number
  endpoint_id: number | null
  subpath: string
  mode: 'forward' | 'reply' | null
  method: string
  headers: Record<string, string> | null
  body: string | null
  status: string
  created_at: Date
}

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : d)

function mapAccount(r: RawAccount): AccountRow {
  return {
    id: r.id,
    channel: r.channel,
    name: r.name,
    provider: r.provider,
    email: r.email,
    secretEnc: r.secret_enc,
    fromName: r.from_name,
    host: r.host,
    port: r.port,
    secure: r.secure,
    proxy: r.proxy,
    createdAt: iso(r.created_at),
  }
}

function mapEndpoint(r: RawEndpoint): EndpointRow {
  return {
    id: r.id,
    subpath: r.subpath,
    title: r.title,
    description: r.description,
    active: r.active,
    mode: r.mode === 'reply' ? 'reply' : 'forward',
    methods: r.methods,
    parser: r.parser ?? null,
    auth: r.auth ?? { type: 'none' },
    targets: r.targets,
    reply: r.reply ?? null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }
}

function mapLog(r: RawLog): LogRow {
  return {
    id: r.id,
    endpointId: r.endpoint_id,
    inboundLogId: r.inbound_log_id,
    channel: r.channel,
    target: r.target,
    requestUrl: r.request_url,
    requestMethod: r.request_method,
    requestHeaders: redactHeaders(r.request_headers),
    requestBody: r.request_body,
    responseStatus: r.response_status,
    responseBody: r.response_body,
    durationMs: r.duration_ms,
    status: r.status as 'success' | 'failed',
    error: r.error,
    createdAt: iso(r.created_at),
  }
}

function mapInbound(r: RawInbound): InboundLogRow {
  return {
    id: r.id,
    endpointId: r.endpoint_id,
    subpath: r.subpath,
    mode: r.mode === 'reply' ? 'reply' : 'forward',
    method: r.method,
    headers: redactHeaders(r.headers),
    body: r.body,
    status: r.status as 'received',
    createdAt: iso(r.created_at),
  }
}

export async function createPgRepos(url: string): Promise<Repos> {
  // 动态加载，避免 SQLite 部署强依赖 postgres 包
  const { default: postgres } = await import('postgres')
  const sql = postgres(url)

  // auth 存储态为 EndpointAuth | Record<string,unknown>，收窄为 postgres 可序列化 JSON
  const asJson = (v: unknown) => sql.json(v as Parameters<typeof sql.json>[0])

  await sql`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id          SERIAL PRIMARY KEY,
      channel     TEXT NOT NULL DEFAULT 'email',
      name        TEXT NOT NULL,
      provider    TEXT NOT NULL,
      email       TEXT NOT NULL,
      secret_enc  TEXT NOT NULL,
      from_name   TEXT,
      host        TEXT NOT NULL,
      port        INTEGER NOT NULL,
      secure      BOOLEAN NOT NULL DEFAULT TRUE,
      proxy       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  await sql`ALTER TABLE email_accounts ADD COLUMN IF NOT EXISTS proxy TEXT`
  await sql`
    CREATE TABLE IF NOT EXISTS endpoints (
      id          SERIAL PRIMARY KEY,
      subpath     TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      description TEXT,
      active      BOOLEAN NOT NULL DEFAULT TRUE,
      mode        TEXT NOT NULL DEFAULT 'forward',
      methods     JSONB NOT NULL DEFAULT '["POST"]',
      parser      JSONB,
      auth        JSONB,
      targets     JSONB NOT NULL DEFAULT '[]',
      reply       JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS forward_logs (
      id              SERIAL PRIMARY KEY,
      endpoint_id     INTEGER,
      inbound_log_id  INTEGER,
      channel         TEXT,
      target          TEXT,
      request_url     TEXT,
      request_method  TEXT,
      request_headers JSONB,
      request_body    TEXT,
      response_status INTEGER,
      response_body   TEXT,
      duration_ms     INTEGER,
      status          TEXT NOT NULL,
      error           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_endpoint ON forward_logs(endpoint_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_created ON forward_logs(created_at)`
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_inbound ON forward_logs(inbound_log_id)`
  // 旧库前向兼容：补齐新列（幂等）
  await sql`ALTER TABLE forward_logs ADD COLUMN IF NOT EXISTS inbound_log_id INTEGER`
  await sql`ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'forward'`
  await sql`ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS reply JSONB`
  await sql`ALTER TABLE forward_logs ADD COLUMN IF NOT EXISTS request_url TEXT`
  await sql`ALTER TABLE forward_logs ADD COLUMN IF NOT EXISTS request_method TEXT`
  await sql`ALTER TABLE forward_logs ADD COLUMN IF NOT EXISTS request_headers JSONB`
  await sql`ALTER TABLE forward_logs ADD COLUMN IF NOT EXISTS request_body TEXT`
  await sql`ALTER TABLE forward_logs ADD COLUMN IF NOT EXISTS response_status INTEGER`
  await sql`ALTER TABLE forward_logs ADD COLUMN IF NOT EXISTS response_body TEXT`
  await sql`ALTER TABLE forward_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER`
  await sql`
    CREATE TABLE IF NOT EXISTS inbound_logs (
      id          SERIAL PRIMARY KEY,
      endpoint_id INTEGER,
      subpath     TEXT NOT NULL,
      method      TEXT NOT NULL,
      headers     JSONB,
      body        TEXT,
      status      TEXT NOT NULL DEFAULT 'received',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  await sql`CREATE INDEX IF NOT EXISTS idx_inbound_endpoint ON inbound_logs(endpoint_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_inbound_created ON inbound_logs(created_at)`

  return {
    accounts: {
      async list() {
        const rows = await sql<RawAccount[]>`SELECT * FROM email_accounts ORDER BY id DESC`
        return rows.map(mapAccount)
      },
      async get(id) {
        const [r] = await sql<RawAccount[]>`SELECT * FROM email_accounts WHERE id = ${id}`
        return r ? mapAccount(r) : null
      },
      async create(data: AccountCreate) {
        const [r] = await sql<RawAccount[]>`
          INSERT INTO email_accounts (channel, name, provider, email, secret_enc, from_name, host, port, secure, proxy)
          VALUES (${data.channel}, ${data.name}, ${data.provider}, ${data.email}, ${data.secretEnc},
                  ${data.fromName ?? null}, ${data.host}, ${data.port}, ${data.secure}, ${data.proxy ?? null})
          RETURNING *`
        return mapAccount(r)
      },
      async update(id, data: AccountUpdate) {
        const [cur] = await sql<RawAccount[]>`SELECT * FROM email_accounts WHERE id = ${id}`
        if (!cur) return null
        const [r] = await sql<RawAccount[]>`
          UPDATE email_accounts SET
            name=${data.name ?? cur.name},
            provider=${data.provider ?? cur.provider},
            email=${data.email ?? cur.email},
            secret_enc=${data.secretEnc ?? cur.secret_enc},
            from_name=${data.fromName ?? cur.from_name},
            host=${data.host ?? cur.host},
            port=${data.port ?? cur.port},
            secure=${data.secure ?? cur.secure},
            proxy=${data.proxy !== undefined ? data.proxy : cur.proxy}
          WHERE id=${id} RETURNING *`
        return mapAccount(r)
      },
      async remove(id) {
        const res = await sql`DELETE FROM email_accounts WHERE id = ${id}`
        return res.count > 0
      },
    },

    endpoints: {
      async list() {
        const rows = await sql<RawEndpoint[]>`SELECT * FROM endpoints ORDER BY id DESC`
        return rows.map(mapEndpoint)
      },
      async get(id) {
        const [r] = await sql<RawEndpoint[]>`SELECT * FROM endpoints WHERE id = ${id}`
        return r ? mapEndpoint(r) : null
      },
      async getBySubpath(subpath) {
        const [r] = await sql<RawEndpoint[]>`SELECT * FROM endpoints WHERE subpath = ${subpath}`
        return r ? mapEndpoint(r) : null
      },
      async create(data: EndpointCreate) {
        const [r] = await sql<RawEndpoint[]>`
          INSERT INTO endpoints (subpath, title, description, active, mode, methods, parser, auth, targets, reply)
          VALUES (${data.subpath}, ${data.title}, ${data.description ?? null}, ${data.active}, ${data.mode},
                  ${sql.json(data.methods)}, ${data.parser ? sql.json(data.parser) : null},
                  ${data.auth ? asJson(data.auth) : null}, ${sql.json(data.targets)}, ${data.reply ? sql.json(data.reply) : null})
          RETURNING *`
        return mapEndpoint(r)
      },
      async update(id, data: EndpointUpdate) {
        const [cur] = await sql<RawEndpoint[]>`SELECT * FROM endpoints WHERE id = ${id}`
        if (!cur) return null
        const reply = data.reply !== undefined ? data.reply : cur.reply
        const [r] = await sql<RawEndpoint[]>`
          UPDATE endpoints SET
            subpath=${data.subpath ?? cur.subpath},
            title=${data.title ?? cur.title},
            description=${data.description !== undefined ? data.description : cur.description},
            active=${data.active !== undefined ? data.active : cur.active},
            mode=${data.mode ?? cur.mode ?? 'forward'},
            methods=${sql.json(data.methods ?? cur.methods)},
            parser=${data.parser !== undefined ? (data.parser ? sql.json(data.parser) : null) : sql.json(cur.parser)},
            auth=${data.auth !== undefined ? (data.auth ? asJson(data.auth) : null) : asJson(cur.auth)},
            targets=${sql.json(data.targets ?? cur.targets)},
            reply=${reply ? sql.json(reply) : null},
            updated_at=now()
          WHERE id=${id} RETURNING *`
        return mapEndpoint(r)
      },
      async remove(id) {
        const res = await sql`DELETE FROM endpoints WHERE id = ${id}`
        return res.count > 0
      },
    },

    logs: {
      async list(filter: LogFilter = {}) {
        const limit = filter.limit ?? 100
        const rows = await sql<RawLog[]>`
          SELECT * FROM forward_logs
          WHERE ${filter.endpointId !== undefined ? sql`endpoint_id = ${filter.endpointId}` : sql`TRUE`}
            AND ${filter.status ? sql`status = ${filter.status}` : sql`TRUE`}
          ORDER BY id DESC LIMIT ${limit}`
        return rows.map(mapLog)
      },
      async add(entry: LogCreate) {
        await sql`
          INSERT INTO forward_logs
            (endpoint_id, inbound_log_id, channel, target, request_url, request_method, request_headers,
             request_body, response_status, response_body, duration_ms, status, error)
          VALUES (${entry.endpointId ?? null}, ${entry.inboundLogId ?? null}, ${entry.channel ?? null},
                  ${entry.target ?? null}, ${entry.requestUrl ?? null}, ${entry.requestMethod ?? null},
                  ${entry.requestHeaders ? sql.json(entry.requestHeaders) : null}, ${entry.requestBody ?? null},
                  ${entry.responseStatus ?? null}, ${entry.responseBody ?? null}, ${entry.durationMs ?? null},
                  ${entry.status}, ${entry.error ?? null})`
      },
      async addInbound(entry: InboundLogCreate): Promise<number> {
        const [r] = await sql<{ id: number }[]>`
          INSERT INTO inbound_logs (endpoint_id, subpath, method, headers, body, status)
          VALUES (${entry.endpointId ?? null}, ${entry.subpath}, ${entry.method},
                  ${entry.headers ? sql.json(entry.headers) : null}, ${entry.body ?? null}, ${entry.status})
          RETURNING id`
        return r.id
      },
      async listInbound(filter: InboundLogFilter = {}): Promise<InboundLogPage> {
        const mode = filter.mode ?? 'reply'
        const page = Math.max(1, Math.floor(filter.page ?? 1))
        const pageSize = Math.min(100, Math.max(1, Math.floor(filter.pageSize ?? 20)))
        const offset = (page - 1) * pageSize
        const modeFilter = sql`AND COALESCE(e.mode, 'forward') = ${mode}`
        const statusFilter = filter.status
          ? sql`AND EXISTS (SELECT 1 FROM forward_logs sf WHERE sf.inbound_log_id = i.id AND sf.status = ${filter.status})`
          : sql``
        const [{ total }] = await sql<{ total: number }[]>`
          SELECT COUNT(*)::int AS total FROM inbound_logs i
          LEFT JOIN endpoints e ON e.id = i.endpoint_id
          WHERE ${filter.endpointId !== undefined ? sql`i.endpoint_id = ${filter.endpointId}` : sql`TRUE`}
          ${modeFilter} ${statusFilter}`
        const inbounds = await sql<RawInbound[]>`
          SELECT i.*, COALESCE(e.mode, 'forward') AS mode FROM inbound_logs i
          LEFT JOIN endpoints e ON e.id = i.endpoint_id
          WHERE ${filter.endpointId !== undefined ? sql`i.endpoint_id = ${filter.endpointId}` : sql`TRUE`}
          ${modeFilter} ${statusFilter}
          ORDER BY i.id DESC LIMIT ${pageSize} OFFSET ${offset}`
        if (inbounds.length === 0) return { items: [], page, pageSize, total, hasNext: false }
        const ids = inbounds.map(r => r.id)
        const outbounds = await sql<RawLog[]>`
          SELECT * FROM forward_logs WHERE inbound_log_id IN ${sql(ids)} ORDER BY id ASC`
        const byInbound = new Map<number, LogRow[]>()
        for (const o of outbounds) {
          const key = o.inbound_log_id as number
          if (!byInbound.has(key)) byInbound.set(key, [])
          byInbound.get(key)!.push(mapLog(o))
        }
        return {
          items: inbounds.map(i => ({ inbound: mapInbound(i), outbound: byInbound.get(i.id) ?? [] })),
          page,
          pageSize,
          total,
          hasNext: offset + inbounds.length < total,
        }
      },
      async stats(): Promise<Stats> {
        const [{ n: endpoints }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM endpoints`
        const [{ n: accounts }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM email_accounts`
        const [{ n: success }] = await sql<
          { n: number }[]
        >`SELECT COUNT(*)::int AS n FROM forward_logs WHERE status = 'success'`
        const [{ n: failed }] = await sql<
          { n: number }[]
        >`SELECT COUNT(*)::int AS n FROM forward_logs WHERE status = 'failed'`
        const recentRaw = await sql<RawLog[]>`SELECT * FROM forward_logs ORDER BY id DESC LIMIT 10`
        return { endpoints, accounts, success, failed, recent: recentRaw.map(mapLog) }
      },
    },

    async close() {
      await sql.end({ timeout: 5 })
    },
  }
}
