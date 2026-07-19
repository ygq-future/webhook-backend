import { Suspense, lazy } from 'react'
import { cn } from '@/lib/utils'

interface JsonEditorProps {
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  minHeight?: string
  /** 宽容模式：允许 {{变量}} 模板占位符（用于 body 模板） */
  tolerant?: boolean
  readOnly?: boolean
  className?: string
}

// CodeMirror 体积较大，按需加载：仅在弹窗内渲染编辑器时才拉取
const CodeMirrorEditor = lazy(() => import('./json-editor-cm'))

/**
 * Glassmorphism 风格 JSON 代码编辑器（按需加载）：语法高亮 + 行号 + 校验提示。
 * 用于 HTTP 目标的 body 模板与 headers，避免手写裸 JSON。
 */
export function JsonEditor({
  value,
  onChange,
  placeholder,
  minHeight = '140px',
  tolerant = false,
  readOnly = false,
  className,
}: JsonEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          className={cn(
            'glass-soft text-muted-foreground flex items-center justify-center rounded-xl border border-white/10 px-3 py-6 text-xs',
            className,
          )}>
          编辑器加载中…
        </div>
      }>
      <CodeMirrorEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={minHeight}
        tolerant={tolerant}
        readOnly={readOnly}
      />
    </Suspense>
  )
}
