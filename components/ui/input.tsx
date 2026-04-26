import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      className={cn(
        "flex h-11 w-full rounded-xl border border-input bg-surface px-3.5 py-2 text-sm text-text-primary shadow-[0_1px_2px_rgba(15,23,42,0.02)] placeholder:text-text-muted transition-all duration-200 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 focus-visible:ring-offset-0 sm:h-12 sm:px-4",
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
