import { useMemo } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { cn } from '@/lib/utils'
import { prettyJson } from '@/lib/json'

interface CodeMirrorEditorProps {
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  minHeight?: string
  tolerant?: boolean
  readOnly?: boolean
  showFormat?: boolean
}

/** 校验 JSON；tolerant 模式下把 {{...}} 占位符替换掉再解析（避免破坏外层引号） */
function validateJson(text: string, tolerant: boolean): string | null {
  if (!text.trim()) return null
  const test = tolerant ? text.replace(/\{\{[^}]*\}\}/g, '') : text
  try {
    JSON.parse(test)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'JSON 格式错误'
  }
}

const glassTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: 'var(--foreground)', fontSize: '13px' },
    '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
    '.cm-content': { caretColor: '#fff', padding: '10px 0' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'oklch(0.5 0 0)', border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'oklch(0.7 0 0)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#fff' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: 'oklch(0.7 0 0)' },
  },
  { dark: true },
)

/** CodeMirror 实现（按需加载，避免拖慢首屏） */
export default function CodeMirrorEditor({
  value,
  onChange,
  placeholder,
  minHeight = '140px',
  tolerant = false,
  readOnly = false,
  showFormat = true,
}: CodeMirrorEditorProps) {
  const error = validateJson(value, tolerant)
  const extensions = useMemo(() => [json(), glassTheme], [])

  function handleFormat() {
    if (!onChange) return
    const pretty = prettyJson(value, tolerant)
    if (pretty !== null && pretty !== value) onChange(pretty)
  }

  return (
    <div
      className={cn(
        'glass-soft overflow-hidden rounded-xl border transition-colors',
        error ? 'border-destructive/60' : 'border-white/10',
        readOnly && 'opacity-90',
      )}>
      {showFormat && !readOnly && (
        <div className="flex items-center justify-end border-b border-white/10 px-3 py-1">
          <button
            type="button"
            onClick={handleFormat}
            className="text-muted-foreground hover:text-foreground text-xs transition-colors">
            格式化
          </button>
        </div>
      )}
      <CodeMirror
        value={value}
        height={minHeight}
        theme="dark"
        extensions={extensions}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={onChange}
        onBlur={() => {
          if (readOnly || !onChange) return
          const pretty = prettyJson(value, tolerant)
          if (pretty !== null && pretty !== value) onChange(pretty)
        }}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          autocompletion: false,
          bracketMatching: true,
          closeBrackets: true,
        }}
      />
      {error && (
        <div className="bg-destructive/10 text-destructive/90 border-t border-white/10 px-3 py-1.5 text-xs">
          {tolerant ? '提示：' : 'JSON 错误：'}
          {error}
        </div>
      )}
    </div>
  )
}
