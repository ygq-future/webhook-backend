import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * 全局 Toast 容器。极简黑白 + Glassmorphism 主题，右上角展示。
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:glass group-[.toaster]:text-foreground group-[.toaster]:border-white/10 group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
