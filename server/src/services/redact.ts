/**
 * 日志对外返回前的请求头脱敏。
 * 日志仍保留原始值供内部排查，但任何管理 API 都不应把认证凭据返回给浏览器。
 */
const SENSITIVE_HEADER =
  /(^|[-_])(authorization|proxy-authorization|cookie|set-cookie|token|api[-_]?key|secret|password|signature|auth)([-_]|$)/i

export function redactHeaders(headers: Record<string, string> | null): Record<string, string> | null {
  if (!headers) return null
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, SENSITIVE_HEADER.test(key) ? '[REDACTED]' : value]),
  )
}
