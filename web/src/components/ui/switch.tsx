import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-white/25 p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.04)] transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-cyan-300/80 data-[state=checked]:bg-cyan-400 data-[state=checked]:shadow-[0_0_18px_rgba(34,211,238,0.32)] data-[state=unchecked]:bg-slate-950/80',
      className,
    )}
    {...props}
    ref={ref}>
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-slate-300 shadow-[0_1px_4px_rgba(0,0,0,0.5)] ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-slate-950 data-[state=unchecked]:translate-x-0',
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
