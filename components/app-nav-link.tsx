"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell,
  Calendar,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Settings,
  ShoppingBag,
  Users,
  Wallet
} from "lucide-react"
import { cn } from "@/lib/utils"

const iconByHref = {
  "/dashboard": LayoutDashboard,
  "/clients": Users,
  "/passes": ClipboardList,
  "/products": ShoppingBag,
  "/sales": CreditCard,
  "/expenses": Wallet,
  "/agenda": Calendar,
  "/reports": ClipboardList,
  "/notifications": Bell,
  "/settings": Settings
} as const

export function AppNavLink({
  href,
  label
}: {
  href: string
  label: string
}) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(`${href}/`)
  const Icon = iconByHref[href as keyof typeof iconByHref] ?? LayoutDashboard

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex min-w-fit items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-medium tracking-tight transition-all duration-200 lg:min-w-0",
        isActive
          ? "border-primary/18 bg-primary-soft text-primary-hover shadow-[0_10px_22px_rgba(255,106,0,0.07)]"
          : "border-transparent text-text-secondary hover:border-border/80 hover:bg-surface-alt hover:text-text-primary"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200",
          isActive
            ? "border-primary/18 bg-surface text-primary-hover shadow-[0_6px_16px_rgba(255,106,0,0.08)]"
            : "border-border/80 bg-surface text-text-muted group-hover:border-primary/15 group-hover:bg-surface group-hover:text-primary-hover"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="truncate">{label}</span>
      {isActive ? (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
      ) : null}
    </Link>
  )
}
