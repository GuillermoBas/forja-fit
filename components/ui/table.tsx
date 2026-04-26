import * as React from "react"
import { cn } from "@/lib/utils"

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-[1.25rem] border border-border/90 bg-surface shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
}

export function TableHeader(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="bg-surface-alt/90 [&_tr]:border-b [&_tr]:border-border/90" {...props} />
}

export function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="[&_tr:last-child]:border-0" {...props} />
}

export function TableRow(props: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className="border-b border-border/70 transition-colors duration-150 even:bg-surface-alt/[0.38] hover:bg-primary-soft/35"
      {...props}
    />
  )
}

export function TableHead(props: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className="h-12 px-5 text-left align-middle text-[10.5px] font-semibold uppercase tracking-[0.2em] text-text-muted"
      {...props}
    />
  )
}

export function TableCell(props: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className="px-5 py-4 align-middle text-sm leading-6 text-text-primary" {...props} />
}
