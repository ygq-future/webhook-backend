import { Database } from 'bun:sqlite'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
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
 * SQLite 数据访问层实现（bun:sqlite，默认方言）
 * 零原生依赖、文件型、零配置。参考设计文档 §5.5
 */

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
  secure: number
  proxy: string | null
  created_at: string
}

interface RawEndpoint {
  id: number
  subpath: string
  title: string
  description: string | null
  active: number
  mode: string | null
  methods: string
  parser: string | null
  auth: string | null
  targets: string
  reply: string | null
  created_at: string
  updated_at: string
}

interface RawLog {
  id: number
  endpoint_id: number | null
  inbound_log_id: number | null
  channel: string | null
  target: string | null
  request_url: string | null
  request_method: string | null
  request_headers: string | null
  request_body: string | null
  response_status: number | null
  response_body: string | null
  duration_ms: number | null
  status: string
  error: string | null
  created_at: string
}

interface RawInbound {
  id: number
  endpoint_id: number | null
  subpath: string
  mode: string | null
  method: string
  headers: string | null
  body: string | null
  status: string
  created_at: string
}

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
    secure: r.secure === 1,
    proxy: r.proxy,
    createdAt: r.created_at,
  }
}

function mapEndpoint(r: RawEndpoint): EndpointRow {
  return {
    id: r.id,
    subpath: r.subpath,
    title: r.title,
    description: r.description,
    active: r.active === 1,
    mode: r.mode === 'reply' ? 'reply' : 'forward',
    methods: JSON.parse(r.methods),
    parser: r.parser ? JSON.parse(r.parser) : null,
    auth: r.auth ? JSON.parse(r.auth) : { type: 'none' },
    targets: JSON.parse(r.targets),
    reply: r.reply ? JSON.parse(r.reply) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
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
    requestHeaders: redactHeaders(r.request_headers ? JSON.parse(r.request_headers) : null),
    requestBody: r.request_body,
    responseStatus: r.response_status,
    responseBody: r.response_body,
    durationMs: r.duration_ms,
    status: r.status as 'success' | 'failed',
    error: r.error,
    createdAt: r.created_at,
  }
}

function mapInbound(r: RawInbound): InboundLogRow {
  return {
    id: r.id,
    endpointId: r.endpoint_id,
    subpath: r.subpath,
    mode: r.mode === 'reply' ? 'reply' : 'forward',
    method: r.method,
    headers: redactHeaders(r.headers ? JSON.parse(r.headers) : null),
    body: r.body,
    status: r.status as 'received',
    createdAt: r.created_at,
  }
}

/** 幂等补齐列（SQLite 不支持 ADD COLUMN IF NOT EXISTS 的跨版本兼容写法） */
function addColumnIfMissing(db: Database, table: string, column: string, def: string) {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some(c => c.name === column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
  }
}

export function createSqliteRepos(filePath: string): Repos {
  if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true })
  const db = new Database(filePath, { create: true })
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      channel     TEXT NOT NULL DEFAULT 'email',
      name        TEXT NOT NULL,
      provider    TEXT NOT NULL,
      email       TEXT NOT NULL,
      secret_enc  TEXT NOT NULL,
      from_name   TEXT,
      host        TEXT NOT NULL,
      port        INTEGER NOT NULL,
      secure      INTEGER NOT NULL DEFAULT 1,
      proxy       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS endpoints (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      subpath     TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      description TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      mode        TEXT NOT NULL DEFAULT 'forward',
      methods     TEXT NOT NULL DEFAULT '["POST"]',
      parser      TEXT,
      auth        TEXT,
      targets     TEXT NOT NULL DEFAULT '[]',
      reply       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS forward_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_id INTEGER,
      channel     TEXT,
      target      TEXT,
      status      TEXT NOT NULL,
      error       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_logs_endpoint ON forward_logs(endpoint_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created  ON forward_logs(created_at);

    CREATE TABLE IF NOT EXISTS inbound_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint_id INTEGER,
      subpath     TEXT NOT NULL,
      method      TEXT NOT NULL,
      headers     TEXT,
      body        TEXT,
      status      TEXT NOT NULL DEFAULT 'received',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_inbound_endpoint ON inbound_logs(endpoint_id);
    CREATE INDEX IF NOT EXISTS idx_inbound_created  ON inbound_logs(created_at);
  `)
  addColumnIfMissing(db, 'email_accounts', 'proxy', 'TEXT')
  addColumnIfMissing(db, 'endpoints', 'mode', "TEXT NOT NULL DEFAULT 'forward'")
  addColumnIfMissing(db, 'endpoints', 'reply', 'TEXT')

  // 旧库前向兼容：为 forward_logs 补齐新列（幂等）
  addColumnIfMissing(db, 'forward_logs', 'inbound_log_id', 'INTEGER')
  addColumnIfMissing(db, 'forward_logs', 'request_url', 'TEXT')
  addColumnIfMissing(db, 'forward_logs', 'request_method', 'TEXT')
  addColumnIfMissing(db, 'forward_logs', 'request_headers', 'TEXT')
  addColumnIfMissing(db, 'forward_logs', 'request_body', 'TEXT')
  addColumnIfMissing(db, 'forward_logs', 'response_status', 'INTEGER')
  addColumnIfMissing(db, 'forward_logs', 'response_body', 'TEXT')
  addColumnIfMissing(db, 'forward_logs', 'duration_ms', 'INTEGER')

  return {
    accounts: {
      async list() {
        return (db.query('SELECT * FROM email_accounts ORDER BY id DESC').all() as RawAccount[]).map(mapAccount)
      },
      async get(id) {
        const r = db.query('SELECT * FROM email_accounts WHERE id = ?').get(id) as RawAccount | null
        return r ? mapAccount(r) : null
      },
      async create(data: AccountCreate) {
        const r = db
          .query(
            `INSERT INTO email_accounts (channel, name, provider, email, secret_enc, from_name, host, port, secure, proxy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
          )
          .get(
            data.channel,
            data.name,
            data.provider,
            data.email,
            data.secretEnc,
            data.fromName ?? null,
            data.host,
            data.port,
            data.secure ? 1 : 0,
            data.proxy ?? null,
          ) as RawAccount
        return mapAccount(r)
      },
      async update(id, data: AccountUpdate) {
        const cur = db.query('SELECT * FROM email_accounts WHERE id = ?').get(id) as RawAccount | null
        if (!cur) return null
        const r = db
          .query(
            `UPDATE email_accounts SET name=?, provider=?, email=?, secret_enc=?, from_name=?, host=?, port=?, secure=?, proxy=?
             WHERE id=? RETURNING *`,
          )
          .get(
            data.name ?? cur.name,
            data.provider ?? cur.provider,
            data.email ?? cur.email,
            data.secretEnc ?? cur.secret_enc,
            data.fromName ?? cur.from_name,
            data.host ?? cur.host,
            data.port ?? cur.port,
            (data.secure ?? cur.secure === 1) ? 1 : 0,
            data.proxy !== undefined ? data.proxy : cur.proxy,
            id,
          ) as RawAccount
        return mapAccount(r)
      },
      async remove(id) {
        const res = db.query('DELETE FROM email_accounts WHERE id = ?').run(id)
        return res.changes > 0
      },
    },

    endpoints: {
      async list() {
        return (db.query('SELECT * FROM endpoints ORDER BY id DESC').all() as RawEndpoint[]).map(mapEndpoint)
      },
      async get(id) {
        const r = db.query('SELECT * FROM endpoints WHERE id = ?').get(id) as RawEndpoint | null
        return r ? mapEndpoint(r) : null
      },
      async getBySubpath(subpath) {
        const r = db.query('SELECT * FROM endpoints WHERE subpath = ?').get(subpath) as RawEndpoint | null
        return r ? mapEndpoint(r) : null
      },
      async create(data: EndpointCreate) {
        const r = db
          .query(
            `INSERT INTO endpoints (subpath, title, description, active, mode, methods, parser, auth, targets, reply)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
          )
          .get(
            data.subpath,
            data.title,
            data.description ?? null,
            data.active ? 1 : 0,
            data.mode,
            JSON.stringify(data.methods),
            data.parser ? JSON.stringify(data.parser) : null,
            data.auth ? JSON.stringify(data.auth) : null,
            JSON.stringify(data.targets),
            data.reply ? JSON.stringify(data.reply) : null,
          ) as RawEndpoint
        return mapEndpoint(r)
      },
      async update(id, data: EndpointUpdate) {
        const cur = db.query('SELECT * FROM endpoints WHERE id = ?').get(id) as RawEndpoint | null
        if (!cur) return null
        const r = db
          .query(
            `UPDATE endpoints SET subpath=?, title=?, description=?, active=?, mode=?, methods=?, parser=?, auth=?, targets=?, reply=?,
             updated_at=datetime('now') WHERE id=? RETURNING *`,
          )
          .get(
            data.subpath ?? cur.subpath,
            data.title ?? cur.title,
            data.description !== undefined ? data.description : cur.description,
            data.active !== undefined ? (data.active ? 1 : 0) : cur.active,
            data.mode ?? cur.mode ?? 'forward',
            data.methods ? JSON.stringify(data.methods) : cur.methods,
            data.parser !== undefined ? (data.parser ? JSON.stringify(data.parser) : null) : cur.parser,
            data.auth !== undefined ? (data.auth ? JSON.stringify(data.auth) : null) : cur.auth,
            data.targets ? JSON.stringify(data.targets) : cur.targets,
            data.reply !== undefined ? (data.reply ? JSON.stringify(data.reply) : null) : cur.reply,
            id,
          ) as RawEndpoint
        return mapEndpoint(r)
      },
      async remove(id) {
        const res = db.query('DELETE FROM endpoints WHERE id = ?').run(id)
        return res.changes > 0
      },
    },

    logs: {
      async list(filter: LogFilter = {}) {
        const where: string[] = []
        const params: (number | string)[] = []
        if (filter.endpointId !== undefined) {
          where.push('endpoint_id = ?')
          params.push(filter.endpointId)
        }
        if (filter.status) {
          where.push('status = ?')
          params.push(filter.status)
        }
        const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
        const limit = filter.limit ?? 100
        return (
          db.query(`SELECT * FROM forward_logs ${clause} ORDER BY id DESC LIMIT ?`).all(...params, limit) as RawLog[]
        ).map(mapLog)
      },
      async add(entry: LogCreate) {
        db.query(
          `INSERT INTO forward_logs
            (endpoint_id, inbound_log_id, channel, target, request_url, request_method, request_headers,
             request_body, response_status, response_body, duration_ms, status, error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          entry.endpointId ?? null,
          entry.inboundLogId ?? null,
          entry.channel ?? null,
          entry.target ?? null,
          entry.requestUrl ?? null,
          entry.requestMethod ?? null,
          entry.requestHeaders ? JSON.stringify(entry.requestHeaders) : null,
          entry.requestBody ?? null,
          entry.responseStatus ?? null,
          entry.responseBody ?? null,
          entry.durationMs ?? null,
          entry.status,
          entry.error ?? null,
        )
      },
      async addInbound(entry: InboundLogCreate): Promise<number> {
        const r = db
          .query(
            `INSERT INTO inbound_logs (endpoint_id, subpath, method, headers, body, status)
             VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
          )
          .get(
            entry.endpointId ?? null,
            entry.subpath,
            entry.method,
            entry.headers ? JSON.stringify(entry.headers) : null,
            entry.body ?? null,
            entry.status,
          ) as { id: number }
        return r.id
      },
      async listInbound(filter: InboundLogFilter = {}): Promise<InboundLogPage> {
        const where: string[] = []
        const params: (number | string)[] = []
        const mode = filter.mode ?? 'reply'
        const page = Math.max(1, Math.floor(filter.page ?? 1))
        const pageSize = Math.min(100, Math.max(1, Math.floor(filter.pageSize ?? 20)))
        if (filter.endpointId !== undefined) {
          where.push('i.endpoint_id = ?')
          params.push(filter.endpointId)
        }
        where.push("COALESCE(e.mode, 'forward') = ?")
        params.push(mode)
        if (filter.status) {
          where.push('EXISTS (SELECT 1 FROM forward_logs sf WHERE sf.inbound_log_id = i.id AND sf.status = ?)')
          params.push(filter.status)
        }
        const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
        const from = 'inbound_logs i LEFT JOIN endpoints e ON e.id = i.endpoint_id'
        const total = (db.query(`SELECT COUNT(*) AS n FROM ${from} ${clause}`).get(...params) as { n: number }).n
        const offset = (page - 1) * pageSize
        const inbounds = db
          .query(
            `SELECT i.*, COALESCE(e.mode, 'forward') AS mode FROM ${from} ${clause} ORDER BY i.id DESC LIMIT ? OFFSET ?`,
          )
          .all(...params, pageSize, offset) as RawInbound[]
        if (inbounds.length === 0) return { items: [], page, pageSize, total, hasNext: false }
        const ids = inbounds.map(r => r.id)
        const placeholders = ids.map(() => '?').join(',')
        const outbounds = db
          .query(`SELECT * FROM forward_logs WHERE inbound_log_id IN (${placeholders}) ORDER BY id ASC`)
          .all(...ids) as RawLog[]
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
        const endpoints = (db.query('SELECT COUNT(*) AS n FROM endpoints').get() as { n: number }).n
        const accounts = (db.query('SELECT COUNT(*) AS n FROM email_accounts').get() as { n: number }).n
        const success = (
          db.query("SELECT COUNT(*) AS n FROM forward_logs WHERE status = 'success'").get() as { n: number }
        ).n
        const failed = (
          db.query("SELECT COUNT(*) AS n FROM forward_logs WHERE status = 'failed'").get() as { n: number }
        ).n
        const recent = (db.query('SELECT * FROM forward_logs ORDER BY id DESC LIMIT 10').all() as RawLog[]).map(mapLog)
        return { endpoints, accounts, success, failed, recent }
      },
    },

    async close() {
      db.close()
    },
  }
}
