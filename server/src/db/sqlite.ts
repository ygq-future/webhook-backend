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
  LogCreate,
  LogFilter,
  LogRow,
  Repos,
  Stats,
} from './types'

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
  created_at: string
}

interface RawEndpoint {
  id: number
  subpath: string
  title: string
  description: string | null
  active: number
  methods: string
  parser: string | null
  auth: string | null
  targets: string
  created_at: string
  updated_at: string
}

interface RawLog {
  id: number
  endpoint_id: number | null
  channel: string | null
  target: string | null
  status: string
  error: string | null
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
    methods: JSON.parse(r.methods),
    parser: r.parser ? JSON.parse(r.parser) : null,
    auth: r.auth ? JSON.parse(r.auth) : { type: 'none' },
    targets: JSON.parse(r.targets),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
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
    createdAt: r.created_at,
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
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS endpoints (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      subpath     TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      description TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      methods     TEXT NOT NULL DEFAULT '["POST"]',
      parser      TEXT,
      auth        TEXT,
      targets     TEXT NOT NULL DEFAULT '[]',
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
  `)

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
            `INSERT INTO email_accounts (channel, name, provider, email, secret_enc, from_name, host, port, secure)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
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
          ) as RawAccount
        return mapAccount(r)
      },
      async update(id, data: AccountUpdate) {
        const cur = db.query('SELECT * FROM email_accounts WHERE id = ?').get(id) as RawAccount | null
        if (!cur) return null
        const r = db
          .query(
            `UPDATE email_accounts SET name=?, provider=?, email=?, secret_enc=?, from_name=?, host=?, port=?, secure=?
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
            `INSERT INTO endpoints (subpath, title, description, active, methods, parser, auth, targets)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
          )
          .get(
            data.subpath,
            data.title,
            data.description ?? null,
            data.active ? 1 : 0,
            JSON.stringify(data.methods),
            data.parser ? JSON.stringify(data.parser) : null,
            data.auth ? JSON.stringify(data.auth) : null,
            JSON.stringify(data.targets),
          ) as RawEndpoint
        return mapEndpoint(r)
      },
      async update(id, data: EndpointUpdate) {
        const cur = db.query('SELECT * FROM endpoints WHERE id = ?').get(id) as RawEndpoint | null
        if (!cur) return null
        const r = db
          .query(
            `UPDATE endpoints SET subpath=?, title=?, description=?, active=?, methods=?, parser=?, auth=?, targets=?,
             updated_at=datetime('now') WHERE id=? RETURNING *`,
          )
          .get(
            data.subpath ?? cur.subpath,
            data.title ?? cur.title,
            data.description !== undefined ? data.description : cur.description,
            data.active !== undefined ? (data.active ? 1 : 0) : cur.active,
            data.methods ? JSON.stringify(data.methods) : cur.methods,
            data.parser !== undefined ? (data.parser ? JSON.stringify(data.parser) : null) : cur.parser,
            data.auth !== undefined ? (data.auth ? JSON.stringify(data.auth) : null) : cur.auth,
            data.targets ? JSON.stringify(data.targets) : cur.targets,
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
        db.query(`INSERT INTO forward_logs (endpoint_id, channel, target, status, error) VALUES (?, ?, ?, ?, ?)`).run(
          entry.endpointId ?? null,
          entry.channel ?? null,
          entry.target ?? null,
          entry.status,
          entry.error ?? null,
        )
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
