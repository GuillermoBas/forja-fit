import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(255,106,0,0.16)] hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-[0_12px_24px_rgba(232,95,0,0.16)]",
        outline:
          "border border-border/90 bg-surface text-text-primary shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-primary/20 hover:bg-primary-soft/45 hover:text-primary-hover",
        ghost: "text-text-secondary hover:bg-surface-alt/85 hover:text-text-primary",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_10px_22px_rgba(220,38,38,0.16)] hover:-translate-y-0.5 hover:bg-destructive/92"
      },
      size: {
        default: "h-11 px-5.5 py-2",
        sm: "h-9 px-4",
        lg: "h-12 px-6"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
