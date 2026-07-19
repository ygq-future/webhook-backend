import { createHmac } from 'node:crypto'
import type { HmacAuth } from '@wh/shared'
import { safeEqual } from './crypto'

/**
 * 通用 HMAC-SHA-256 验签器（与来源无关）
 * 支持 hex / base64 / prefix(如 sha256=) / scheme(如 HMAC、Bearer) 编码，
 * 被签内容可为 raw-body / raw-body+ts / query，含可选时间戳防重放。
 * 参考设计文档 §5.1.1
 */

export interface VerifyInput {
  raw: string
  headers: Record<string, string>
  query: Record<string, string>
}

export interface VerifyResult {
  ok: boolean
  reason?: string
}

function sortedQueryString(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map(k => `${k}=${query[k]}`)
    .join('&')
}

function buildSignData(auth: HmacAuth, input: VerifyInput): string {
  switch (auth.signData) {
    case 'raw-body':
      return input.raw
    case 'raw-body+ts': {
      const ts = auth.timestampHeader ? (input.headers[auth.timestampHeader.toLowerCase()] ?? '') : ''
      return `${ts}.${input.raw}`
    }
    case 'query':
      return sortedQueryString(input.query)
    case 'header':
      return auth.header ? (input.headers[auth.header.toLowerCase()] ?? '') : ''
    default:
      return input.raw
  }
}

/** 从头值中剥离前缀/方案关键字，得到纯签名 token */
function extractToken(headerValue: string, auth: HmacAuth): string {
  const v = headerValue.trim()
  if (auth.scheme === 'prefix' && auth.prefix) {
    return v.startsWith(auth.prefix) ? v.slice(auth.prefix.length) : v
  }
  if (auth.scheme === 'scheme' && auth.schemeKeyword) {
    const kw = auth.schemeKeyword
    return v.startsWith(kw) ? v.slice(kw.length).trim() : v
  }
  return v
}

function checkTimestamp(auth: HmacAuth, input: VerifyInput): VerifyResult {
  if (!auth.timestampHeader || !auth.tolerance) return { ok: true }
  const raw = input.headers[auth.timestampHeader.toLowerCase()]
  if (!raw) return { ok: false, reason: 'missing timestamp' }
  let ts = Number(raw)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid timestamp' }
  if (ts > 1e12) ts = Math.floor(ts / 1000) // 毫秒 → 秒
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > auth.tolerance) return { ok: false, reason: 'timestamp out of tolerance' }
  return { ok: true }
}

/**
 * 校验入站签名。secret 为解密后的明文密钥。
 * 比较使用恒定时间；同时兼容 hex/base64 两种签名文本。
 */
export function verifyInboundHmac(auth: HmacAuth, input: VerifyInput, secret: string): VerifyResult {
  const headerValue = input.headers[auth.header.toLowerCase()]
  if (!headerValue) return { ok: false, reason: `missing signature header ${auth.header}` }

  const tsCheck = checkTimestamp(auth, input)
  if (!tsCheck.ok) return tsCheck

  const data = buildSignData(auth, input)
  const digest = createHmac(auth.algorithm, secret).update(data).digest()
  const hex = digest.toString('hex')
  const b64 = digest.toString('base64')

  const provided = extractToken(headerValue, auth)
  const ok = safeEqual(provided.toLowerCase(), hex.toLowerCase()) || safeEqual(provided, b64)
  return ok ? { ok: true } : { ok: false, reason: 'signature mismatch' }
}

/**
 * 出站签名：为 HttpChannel 生成签名头值（反向复用同一套编码方案）。
 */
export function signOutbound(
  data: string,
  secret: string,
  opts: {
    algorithm?: 'sha256' | 'sha1' | 'sha512'
    scheme?: 'hex' | 'base64' | 'prefix' | 'scheme'
    prefix?: string
    schemeKeyword?: string
  } = {},
): string {
  const { algorithm = 'sha256', scheme = 'hex', prefix = '', schemeKeyword = '' } = opts
  const digest = createHmac(algorithm, secret).update(data).digest()
  const hex = digest.toString('hex')
  const b64 = digest.toString('base64')
  switch (scheme) {
    case 'base64':
      return b64
    case 'prefix':
      return `${prefix}${hex}`
    case 'scheme':
      return `${schemeKeyword} ${b64}`.trim()
    case 'hex':
    default:
      return hex
  }
}
