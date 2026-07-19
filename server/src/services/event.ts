import type { Parser } from '@wh/shared'
import { getByPath } from './expr'

/**
 * 入站事件对象与解析（自定义请求体接收结构）
 * 参考设计文档 §5.1
 */
export interface EventObject {
  method: string
  /** 原始请求体字节（字符串形式），用于 HMAC 验签 */
  raw: string
  /** 解析后的请求体（json→对象 / form→对象 / text|raw→字符串） */
  body: unknown
  headers: Record<string, string>
  query: Record<string, string>
  /** 按 parser.mapping 抽取出的命名变量 */
  vars: Record<string, unknown>
}

export interface RawRequestInput {
  method: string
  raw: string
  headers: Record<string, string>
  query: Record<string, string>
}

export function parseBody(raw: string, contentType: Parser['contentType']): unknown {
  switch (contentType) {
    case 'json':
      try {
        return raw ? JSON.parse(raw) : {}
      } catch {
        return raw
      }
    case 'form':
      return Object.fromEntries(new URLSearchParams(raw))
    case 'text':
    case 'raw':
    default:
      return raw
  }
}

/** 依据 parser 配置把原始请求归一为事件对象 */
export function buildEvent(input: RawRequestInput, parser?: Parser): EventObject {
  const contentType = parser?.contentType ?? 'json'
  const source = parser?.source ?? 'body'
  const body = parseBody(input.raw, contentType)

  const root: unknown = source === 'query' ? input.query : source === 'header' ? input.headers : body

  const vars: Record<string, unknown> = {}
  if (parser?.mapping) {
    for (const [name, path] of Object.entries(parser.mapping)) {
      vars[name] = getByPath(root, path)
    }
  }

  return { method: input.method, raw: input.raw, body, headers: input.headers, query: input.query, vars }
}

/**
 * 生成模板/表达式渲染上下文：
 * - 顶层直接暴露命名变量（`{{text}}` → vars.text）
 * - 当未配置 mapping 时，自动把请求体顶层字段作为便捷变量（`{{message}}` → body.message）
 * - 命名冲突时显式 mapping > 请求体字段，保留 body/headers/query/raw/method/vars 命名空间
 */
export function eventContext(event: EventObject): Record<string, unknown> {
  const bodyVars: Record<string, unknown> = {}
  if (event.body && typeof event.body === 'object' && !Array.isArray(event.body)) {
    Object.assign(bodyVars, event.body as Record<string, unknown>)
  }
  return {
    ...bodyVars,
    ...event.vars,
    vars: event.vars,
    body: event.body,
    headers: event.headers,
    query: event.query,
    raw: event.raw,
    method: event.method,
  }
}
