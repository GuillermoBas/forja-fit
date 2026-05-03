import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary-soft text-primary-hover",
        secondary: "border-border/90 bg-surface-alt text-text-secondary",
        success: "border-success/18 bg-success/10 text-success",
        paused: "border-info/20 bg-info/10 text-info",
        warning: "border-warning/18 bg-warning/10 text-warning",
        danger: "border-error/18 bg-error/10 text-error"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
