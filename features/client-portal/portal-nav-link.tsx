"use client"

import {
  Activity,
  CalendarDays,
  Settings,
  Sparkles,
  type LucideIcon
} from "lucide-react"
import { usePathname } from "next/navigation"
import {
  getPathnameFromHref,
  InstantLink,
  useInstantNavigation
} from "@/components/instant-navigation"
import { cn } from "@/lib/utils"

export type PortalNavIcon = "activity" | "calendar" | "nutrition" | "settings"

const iconByKey: Record<PortalNavIcon, LucideIcon> = {
  activity: Activity,
  calendar: CalendarDays,
  nutrition: Sparkles,
  settings: Settings
}

function isCurrentNavItem(currentPath: string, matches: string[]) {
  return matches.some((path) => currentPath === path || currentPath.startsWith(`${path}/`))
}

export function PortalDesktopNavLink({
  href,
  label,
  icon,
  matches,
  currentPath
}: {
  href: string
  label: string
  icon: PortalNavIcon
  matches: string[]
  currentPath: string
}) {
  const pathname = usePathname()
  const { pendingHref } = useInstantNavigation()
  const optimisticPath = getPathnameFromHref(pendingHref) ?? pathname ?? currentPath
  const isActive = isCurrentNavItem(optimisticPath, matches)
  const Icon = iconByKey[icon]

  return (
    <InstantLink
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-medium transition-all duration-200",
        isActive
          ? "border-primary/18 bg-primary-soft text-primary-hover shadow-[0_12px_24px_rgba(255,106,0,0.08)]"
          : "border-transparent text-text-secondary hover:border-border/80 hover:bg-surface-alt hover:text-text-primary"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-200",
          isActive
            ? "border-primary/18 bg-surface text-primary-hover shadow-[0_6px_16px_rgba(255,106,0,0.08)]"
            : "border-border/80 bg-surface text-text-muted group-hover:border-primary/15 group-hover:text-primary-hover"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </InstantLink>
  )
}

export function PortalMobileNavLink({
  href,
  label,
  icon,
  matches,
  currentPath
}: {
  href: string
  label: string
  icon: PortalNavIcon
  matches: string[]
  currentPath: string
}) {
  const pathname = usePathname()
  const { pendingHref } = useInstantNavigation()
  const optimisticPath = getPathnameFromHref(pendingHref) ?? pathname ?? currentPath
  const isActive = isCurrentNavItem(optimisticPath, matches)
  const Icon = iconByKey[icon]

  return (
    <InstantLink
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "portal-mobile-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isActive ? "portal-mobile-tab-active" : "hover:bg-surface-alt/75 hover:text-text-primary"
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary-hover" : "text-text-muted")} />
      <span className="w-full truncate text-center leading-none">{label}</span>
    </InstantLink>
  )
}
