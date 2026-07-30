import * as React from 'react'

import { cn } from '@/lib/utils'

export function PageLayout({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex h-full min-h-0 flex-col gap-6 overflow-hidden', className)} {...props} />
}

export function PageHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('shrink-0', className)} {...props} />
}

export function PageBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain', className)}
      {...props}
    />
  )
}
