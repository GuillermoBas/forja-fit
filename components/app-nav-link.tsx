"use client"

import { usePathname } from "next/navigation"
import {
  Bell,
  Calendar,
  ClipboardList,
  CreditCard,
  type LucideIcon,
  LayoutDashboard,
  Settings,
  ShoppingBag,
  Users,
  Wallet
} from "lucide-react"
import { getPathnameFromHref, InstantLink, useInstantNavigation } from "@/components/instant-navigation"
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
  label,
  icon
}: {
  href: string
  label: string
  icon?: LucideIcon
}) {
  const pathname = usePathname()
  const { pendingHref } = useInstantNavigation()
  const optimisticPathname = getPathnameFromHref(pendingHref) ?? pathname
  const isActive = optimisticPathname === href || optimisticPathname.startsWith(`${href}/`)
  const Icon = icon ?? iconByHref[href as keyof typeof iconByHref] ?? LayoutDashboard

  return (
    <InstantLink
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex min-w-0 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-2 text-center text-[10px] font-medium leading-4 tracking-tight transition-all duration-200 sm:w-[4.35rem] sm:min-w-[4.35rem] md:h-full md:w-full md:min-w-0 md:px-2 lg:h-auto lg:w-full lg:flex-row lg:justify-start lg:gap-2.5 lg:px-3 lg:py-2.5 lg:text-sm lg:leading-5 lg:text-left",
        isActive
          ? "border-primary bg-primary text-white shadow-[0_10px_22px_rgba(18,191,166,0.18)]"
          : "border-transparent text-white/72 hover:border-white/10 hover:bg-white/[0.08] hover:text-white"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 lg:h-8 lg:w-8",
          isActive
            ? "border-white/20 bg-white/15 text-white shadow-[0_6px_16px_rgba(13,27,42,0.16)]"
            : "border-white/10 bg-white/[0.04] text-white/58 group-hover:border-white/15 group-hover:bg-white/[0.08] group-hover:text-white"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="max-w-full truncate md:max-w-[6.5rem] lg:max-w-full lg:flex-1">{label}</span>
      {isActive ? (
        <span className="h-1.5 w-1.5 rounded-full bg-primary lg:ml-auto" />
      ) : null}
    </InstantLink>
  )
}
