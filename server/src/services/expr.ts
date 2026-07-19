/**
 * 轻量表达式取值（dot-path）与模板渲染
 * 决策：出站抽取与入站映射统一用零依赖 dot-path（见 PROGRESS 决策：方案 A）。
 * 支持：a.b.c、a.b[0].c、a[0]
 */

/** 按 dot-path 从对象取值；取不到返回 undefined */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  // 将 a[0].b 归一为 a.0.b
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
  let cur: unknown = obj
  for (const key of parts) {
    if (cur == null) return undefined
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

/** 把任意值转为可插入文本/模板的字符串 */
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

/**
 * 渲染 `{{ path }}` 模板：path 走 dot-path，从给定上下文取值。
 * 上下文通常为事件对象（含 vars/body/headers/query）。
 */
export function renderTemplate(tpl: string, context: unknown): string {
  if (!tpl) return ''
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => stringify(getByPath(context, expr.trim())))
}
