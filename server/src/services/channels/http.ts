import type { HttpTarget } from '@wh/shared'
import type { EventObject } from '../event'
import { eventContext } from '../event'
import { getByPath, renderTemplate, stringify } from '../expr'
import { signOutbound } from '../hmac'
import type { ChannelDeps, ForwardChannel, ForwardResult, OutboundRequest, OutboundResponse } from './types'

/**
 * HttpChannel（v1 出站 HTTP 转发）：用 dot-path 表达式抽取消息内容，
 * 以自定义 method/url/headers/body 转发到第三方，支持出站鉴权、超时与指数退避重试。
 * 参考设计文档 §5.3.2
 */

const CONTENT_TYPES: Record<HttpTarget['contentType'], string> = {
  json: 'application/json',
  form: 'application/x-www-form-urlencoded',
  text: 'text/plain',
}

function buildBody(target: HttpTarget, event: EventObject, ctx: Record<string, unknown>): string {
  const extracted = target.bodyExpr ? getByPath(ctx, target.bodyExpr) : undefined

  if (target.bodyTpl) {
    return renderTemplate(target.bodyTpl, { ...ctx, extracted })
  }

  const value = extracted !== undefined ? extracted : (event.body ?? {})

  if (target.contentType === 'form') {
    if (value && typeof value === 'object') {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) params.set(k, stringify(v))
      return params.toString()
    }
    return stringify(value)
  }
  if (target.contentType === 'text') {
    return stringify(value)
  }
  // json
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function applyAuth(target: HttpTarget, headers: Record<string, string>, body: string, ctx: Record<string, unknown>) {
  const auth = target.auth
  switch (auth.type) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${renderTemplate(auth.token, ctx)}`
      break
    case 'basic':
      headers['Authorization'] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`
      break
    case 'hmac':
      headers[auth.header] = signOutbound(body, auth.secretRef, { scheme: auth.scheme })
      break
    case 'none':
    default:
      break
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export class HttpChannel implements ForwardChannel {
  type = 'http'

  async deliver(target: HttpTarget, event: EventObject, _deps: ChannelDeps): Promise<ForwardResult> {
    const ctx = eventContext(event)
    const url = renderTemplate(target.url, ctx)

    const headers: Record<string, string> = {}
    if (target.headers) for (const [k, v] of Object.entries(target.headers)) headers[k] = renderTemplate(v, ctx)

    const hasBody = !['GET', 'HEAD'].includes(target.method)
    const body = hasBody ? buildBody(target, event, ctx) : undefined
    if (hasBody) {
      headers['Content-Type'] = headers['Content-Type'] ?? CONTENT_TYPES[target.contentType]
      applyAuth(target, headers, body ?? '', ctx)
    } else {
      applyAuth(target, headers, '', ctx)
    }

    const attempts = target.retries + 1
    let lastErr = ''
    const request: OutboundRequest = { url, method: target.method, headers, body }
    let response: OutboundResponse | undefined
    for (let i = 0; i < attempts; i++) {
      const started = Date.now()
      try {
        const res = await fetchWithTimeout(url, { method: target.method, headers, body }, target.timeoutMs)
        const respText = await res.text()
        response = { status: res.status, body: respText.slice(0, 8000), durationMs: Date.now() - started }
        if (res.ok) return { ok: true, detail: `HTTP ${res.status}`, request, response }
        lastErr = `HTTP ${res.status}`
      } catch (e) {
        response = {
          status: undefined,
          body: e instanceof Error ? e.message : String(e),
          durationMs: Date.now() - started,
        }
        lastErr = e instanceof Error ? e.message : String(e)
      }
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 2 ** i * 500))
    }
    return { ok: false, detail: lastErr, request, response }
  }
}
