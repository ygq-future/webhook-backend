/**
 * 轻量 dot-path 取值与模板渲染（前端预览用，与后端 server/src/services/expr.ts 保持一致）。
 * 支持：a.b.c、a.b[0].c、a[0]
 */

/** 按 dot-path 从对象取值；取不到返回 undefined */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
  let cur: unknown = obj
  for (const key of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

export function stringify(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 渲染 {{ path }} 模板：path 走 dot-path，从上下文取值 */
export function renderTemplate(tpl: string, context: unknown): string {
  if (!tpl) return ''
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => stringify(getByPath(context, expr.trim())))
}

/**
 * 构造事件上下文（与后端 eventContext 一致）：
 * 顶层直接暴露映射变量，并保留 body/headers/query/raw/method 命名空间。
 */
export function buildEventContext(sampleBody: unknown, vars: Record<string, unknown> = {}): Record<string, unknown> {
  const base = sampleBody && typeof sampleBody === 'object' ? (sampleBody as Record<string, unknown>) : {}
  return {
    ...base,
    ...vars,
    vars,
    body: sampleBody,
    headers: {},
    query: {},
    raw: typeof sampleBody === 'string' ? sampleBody : JSON.stringify(sampleBody ?? {}),
    method: 'POST',
  }
}

/**
 * 预览 HTTP 出站 body（镜像后端 http.ts 的 buildBody）：
 * - bodyExpr 抽取（根 = 事件上下文）
 * - bodyTpl 模板渲染（支持 {{var}}）
 * 返回 { ok, output, error }
 */
export function previewHttpBody(opts: {
  bodyExpr?: string
  bodyTpl?: string
  contentType: 'json' | 'form' | 'text'
  sampleBody: unknown
  vars?: Record<string, unknown>
}): { ok: boolean; output: string; error?: string } {
  try {
    const ctx = buildEventContext(opts.sampleBody, opts.vars)
    const extracted = opts.bodyExpr ? getByPath(ctx, opts.bodyExpr) : undefined

    let value: unknown
    if (opts.bodyTpl) {
      value = renderTemplate(opts.bodyTpl, { ...ctx, extracted })
      return { ok: true, output: String(value) }
    }

    const data = extracted !== undefined ? extracted : (opts.sampleBody ?? {})
    if (opts.contentType === 'form' && data && typeof data === 'object') {
      const p = new URLSearchParams()
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) p.set(k, stringify(v))
      return { ok: true, output: p.toString() }
    }
    if (opts.contentType === 'text') return { ok: true, output: stringify(data) }
    return { ok: true, output: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }
  } catch (e) {
    return { ok: false, output: '', error: e instanceof Error ? e.message : String(e) }
  }
}
