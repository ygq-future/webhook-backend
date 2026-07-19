/**
 * JSON 美化工具：把（可能含 {{变量}} 模板的）文本格式化为 2 空格缩进。
 * tolerant 模式：先把所有 {{...}} 占位符替换为唯一哨兵，格式化后再还原，
 * 这样模板字符串内的 JSON 也能正确缩进而不会破坏外层引号。
 */
export function prettyJson(text: string, tolerant = false): string | null {
  const t = text.trim()
  if (!t) return ''
  if (tolerant) {
    const placeholders: string[] = []
    const replaced = t.replace(/\{\{[^}]*\}\}/g, m => {
      placeholders.push(m)
      return `__WH_TPL_${placeholders.length - 1}__`
    })
    try {
      const obj = JSON.parse(replaced)
      return JSON.stringify(obj, null, 2).replace(/__WH_TPL_(\d+)__/g, (_, i) => placeholders[Number(i)])
    } catch {
      return null
    }
  }
  try {
    return JSON.stringify(JSON.parse(t), null, 2)
  } catch {
    return null
  }
}
