import { createSqliteRepos } from './sqlite'
import { createPgRepos } from './pg'
import type { Repos } from './types'

export type { Repos } from './types'
export * from './types'

/**
 * 数据访问层工厂：按 DATABASE_URL 选择方言。
 * - 留空 / sqlite:xxx / *.db 路径 → SQLite（bun:sqlite，默认）
 * - postgres:// | postgresql:// → PostgreSQL（postgres.js）
 * 参考设计文档 §5.5 / §10.3
 */
export async function createRepos(databaseUrl = Bun.env.DATABASE_URL ?? ''): Promise<Repos> {
  const url = databaseUrl.trim()

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return createPgRepos(url)
  }

  // SQLite：支持 sqlite:./path 前缀或裸文件路径；留空取默认
  let file = url
  if (file.startsWith('sqlite:')) file = file.slice('sqlite:'.length)
  if (!file) file = './data/app.db'
  return createSqliteRepos(file)
}

let singleton: Repos | null = null

/** 获取进程级单例 Repos（首次调用时初始化） */
export async function getRepos(): Promise<Repos> {
  if (!singleton) singleton = await createRepos()
  return singleton
}

/** 测试/关闭时重置单例 */
export async function closeRepos(): Promise<void> {
  if (singleton) {
    await singleton.close()
    singleton = null
  }
}
