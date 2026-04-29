import Image from "next/image"
import { LogOut } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { appConfig } from "@/lib/config"
import { NutritionAssistantEntrypoint } from "@/features/client-portal/nutrition/assistant-entrypoint"
import { portalSignOutAction } from "@/features/client-portal/auth/actions"
import {
  PortalDesktopNavLink,
  PortalMobileNavLink,
  type PortalNavIcon
} from "@/features/client-portal/portal-nav-link"

const navItems: Array<{ href: string; label: string; icon: PortalNavIcon; matches: string[] }> = [
  { href: "/cliente/dashboard", label: "Actividad", icon: "activity", matches: ["/cliente/dashboard", "/cliente/actividad"] },
  { href: "/cliente/agenda", label: "Agenda", icon: "calendar", matches: ["/cliente/agenda"] },
  { href: "/cliente/nutricion", label: "Nutrición", icon: "nutrition", matches: ["/cliente/nutricion"] },
  { href: "/cliente/ajustes", label: "Ajustes", icon: "settings", matches: ["/cliente/ajustes"] }
]

function DesktopClientSidebar({
  clientName,
  currentPath
}: {
  clientName: string
  currentPath: string
}) {
  return (
    <aside className="page-section hidden flex-col border-trainium-dark/80 bg-trainium-dark p-5 text-white lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)]">
      <div className="mb-6 rounded-[1.3rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_28px_rgba(7,17,29,0.24)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Portal de cliente</p>
        <Image
          src="/trainium-logo-full.png"
          alt={`Logo de ${appConfig.businessName}`}
          width={320}
          height={320}
          priority
          className="mt-3 h-auto w-36 rounded-xl bg-white object-contain p-1.5"
        />
        <p className="mt-3 text-sm leading-6 text-white/70">
          Tu actividad, agenda, bonos, nutrición y ajustes de contacto.
        </p>
        <Badge variant="default" className="mt-4 w-fit max-w-full truncate">
          {clientName}
        </Badge>
      </div>

      <nav
        aria-label="Navegación del portal de cliente"
        className="space-y-2"
      >
        {navItems.map((item) => (
          <PortalDesktopNavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            matches={item.matches}
            currentPath={currentPath}
          />
        ))}
      </nav>

      <form action={portalSignOutAction} className="mt-auto pt-5">
        <Button variant="outline" className="w-full gap-2 rounded-2xl">
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </form>
    </aside>
  )
}

function MobileClientTopbar({ clientName }: { clientName: string }) {
  return (
    <div className="page-section portal-mobile-topbar relative lg:hidden md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
      <div className="flex min-w-0 items-center gap-3 md:col-start-2 md:flex-col md:items-center md:justify-center md:gap-2">
        <div className="min-w-0">
          <p className="section-kicker">Portal de cliente</p>
          <p className="mt-0.5 truncate font-heading text-base font-bold text-text-primary sm:text-lg md:text-center">
            {appConfig.businessName}
          </p>
        </div>
        <Badge variant="default" className="max-w-[40vw] shrink truncate px-2.5 py-1 text-[10px] sm:max-w-[42vw] md:max-w-full md:px-3 md:text-center">
          {clientName}
        </Badge>
      </div>
      <form action={portalSignOutAction} className="shrink-0 md:col-start-3 md:justify-self-end">
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-11 rounded-2xl p-0"
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}

function MobileClientBottomNav({ currentPath }: { currentPath: string }) {
  return (
    <nav aria-label="Navegación del portal de cliente" className="portal-mobile-bottom-nav">
      <div className="portal-mobile-bottom-nav-grid">
        {navItems.map((item) => (
          <PortalMobileNavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            matches={item.matches}
            currentPath={currentPath}
          />
        ))}
      </div>
    </nav>
  )
}

export function PortalShell({
  children,
  title,
  description,
  clientName,
  currentPath
}: {
  children: React.ReactNode
  title: string
  description: string
  clientName: string
  currentPath: string
}) {
  return (
    <div className="portal-mobile-shell mobile-page-shell min-h-screen bg-transparent lg:px-6 lg:py-6">
      <div className="mx-auto grid h-full min-h-0 w-full max-w-[1600px] grid-rows-[minmax(0,1fr)] gap-4 lg:min-h-screen lg:grid-cols-[292px_minmax(0,1fr)] lg:grid-rows-none lg:gap-5">
        <DesktopClientSidebar clientName={clientName} currentPath={currentPath} />

        <main className="portal-mobile-scroll-region portal-mobile-content-safe mobile-content-safe w-full min-w-0 max-w-full space-y-2.5 sm:space-y-3 lg:space-y-6 lg:pb-6">
          <MobileClientTopbar clientName={clientName} />

          <header className="mobile-sticky-panel page-section app-page-header w-full min-w-0 max-w-full px-3.5 py-2 sm:px-4 sm:py-2.5 lg:px-4 lg:py-2.5">
            <div className="app-page-header-copy min-w-0">
              <div className="min-w-0">
                <h2 className="truncate font-heading text-[1.05rem] font-bold tracking-[-0.03em] text-text-primary sm:text-[1.2rem] lg:text-[1.45rem]">
                  {title}
                </h2>
                <p className="mt-0.5 text-[11px] leading-4 text-text-secondary sm:text-[12px] sm:leading-[1.35] lg:text-[13px] lg:leading-[1.4]">
                  {description}
                </p>
              </div>
            </div>
          </header>

          <Card className="w-full min-w-0 max-w-full rounded-[1.2rem] border-border/90 bg-card p-0.5 sm:rounded-[1.35rem] lg:rounded-[1.75rem] lg:p-1">
            <div className="min-w-0 space-y-3 p-2.5 sm:space-y-4 sm:p-3 lg:space-y-5 lg:p-4">{children}</div>
          </Card>
        </main>
      </div>

      <MobileClientBottomNav currentPath={currentPath} />
      <NutritionAssistantEntrypoint />
    </div>
  )
}
