import type { Context } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'

/**
 * 管理员会话：基于签名 Cookie（无服务端会话存储，进程无状态）。
 * Cookie 值为 `user|issuedAt`，用 SESSION_SECRET 做 HMAC 签名防篡改。
 * 参考设计文档 §11 安全设计
 */

const COOKIE = 'wh_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 天

export function sessionSecret(): string {
  return Bun.env.SESSION_SECRET ?? 'dev-insecure-session-secret-change-me'
}

/** 写入签名会话 Cookie */
export async function createSession(c: Context, user: string): Promise<void> {
  const payload = `${user}|${Date.now()}`
  await setSignedCookie(c, COOKIE, payload, sessionSecret(), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: MAX_AGE,
    secure: Bun.env.NODE_ENV === 'production',
  })
}

/** 读取并校验会话，返回用户名或 null */
export async function readSession(c: Context): Promise<string | null> {
  const v = await getSignedCookie(c, sessionSecret(), COOKIE)
  if (!v || typeof v !== 'string') return null
  return v.split('|')[0] ?? null
}

/** 清除会话 Cookie */
export function clearSession(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/' })
}
