import type {
  AccountCreate,
  AccountRow,
  AccountUpdate,
  EndpointCreate,
  EndpointRow,
  EndpointUpdate,
  LogCreate,
  LogFilter,
  LogRow,
  Repos,
  Stats,
} from './types'

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
  created_at: Date
}

interface RawEndpoint {
  id: number
  subpath: string
  title: string
  description: string | null
  active: boolean
  methods: string[]
  parser: EndpointRow['parser']
  auth: EndpointRow['auth'] | null
  targets: EndpointRow['targets']
  created_at: Date
  updated_at: Date
}

interface RawLog {
  id: number
  endpoint_id: number | null
  channel: string | null
  target: string | null
  status: string
  error: string | null
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
    methods: r.methods,
    parser: r.parser ?? null,
    auth: r.auth ?? { type: 'none' },
    targets: r.targets,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }
}

function mapLog(r: RawLog): LogRow {
  return {
    id: r.id,
    endpointId: r.endpoint_id,
    channel: r.channel,
    target: r.target,
    status: r.status as 'success' | 'failed',
    error: r.error,
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
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS endpoints (
      id          SERIAL PRIMARY KEY,
      subpath     TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      description TEXT,
      active      BOOLEAN NOT NULL DEFAULT TRUE,
      methods     JSONB NOT NULL DEFAULT '["POST"]',
      parser      JSONB,
      auth        JSONB,
      targets     JSONB NOT NULL DEFAULT '[]',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  await sql`
    CREATE TABLE IF NOT EXISTS forward_logs (
      id          SERIAL PRIMARY KEY,
      endpoint_id INTEGER,
      channel     TEXT,
      target      TEXT,
      status      TEXT NOT NULL,
      error       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_endpoint ON forward_logs(endpoint_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_logs_created ON forward_logs(created_at)`

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
          INSERT INTO email_accounts (channel, name, provider, email, secret_enc, from_name, host, port, secure)
          VALUES (${data.channel}, ${data.name}, ${data.provider}, ${data.email}, ${data.secretEnc},
                  ${data.fromName ?? null}, ${data.host}, ${data.port}, ${data.secure})
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
            secure=${data.secure ?? cur.secure}
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
          INSERT INTO endpoints (subpath, title, description, active, methods, parser, auth, targets)
          VALUES (${data.subpath}, ${data.title}, ${data.description ?? null}, ${data.active},
                  ${sql.json(data.methods)}, ${data.parser ? sql.json(data.parser) : null},
                  ${data.auth ? asJson(data.auth) : null}, ${sql.json(data.targets)})
          RETURNING *`
        return mapEndpoint(r)
      },
      async update(id, data: EndpointUpdate) {
        const [cur] = await sql<RawEndpoint[]>`SELECT * FROM endpoints WHERE id = ${id}`
        if (!cur) return null
        const [r] = await sql<RawEndpoint[]>`
          UPDATE endpoints SET
            subpath=${data.subpath ?? cur.subpath},
            title=${data.title ?? cur.title},
            description=${data.description !== undefined ? data.description : cur.description},
            active=${data.active !== undefined ? data.active : cur.active},
            methods=${sql.json(data.methods ?? cur.methods)},
            parser=${data.parser !== undefined ? (data.parser ? sql.json(data.parser) : null) : sql.json(cur.parser)},
            auth=${data.auth !== undefined ? (data.auth ? asJson(data.auth) : null) : asJson(cur.auth)},
            targets=${sql.json(data.targets ?? cur.targets)},
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
          INSERT INTO forward_logs (endpoint_id, channel, target, status, error)
          VALUES (${entry.endpointId ?? null}, ${entry.channel ?? null}, ${entry.target ?? null},
                  ${entry.status}, ${entry.error ?? null})`
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
