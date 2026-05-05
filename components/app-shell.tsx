import { Suspense } from "react"
import { Bell } from "lucide-react"
import { TenantLogo } from "@/components/branding"
import { getNotifications } from "@/lib/data"
import { signOutAction } from "@/features/auth/actions"
import { AppNavLink } from "@/components/app-nav-link"
import { InstantLink } from "@/components/instant-navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Profile } from "@/types/domain"

const navItems = [
  { href: "/dashboard", label: "Panel" },
  { href: "/clients", label: "Clientes" },
  { href: "/passes", label: "Bonos" },
  { href: "/products", label: "Productos" },
  { href: "/sales", label: "Ventas" },
  { href: "/expenses", label: "Gastos" },
  { href: "/agenda", label: "Agenda" },
  { href: "/reports", label: "Informes" },
  { href: "/notifications", label: "Notificaciones" },
  { href: "/settings", label: "Ajustes" }
]

async function NotificationShortcut() {
  const notifications = await getNotifications()

  return (
    <InstantLink href="/notifications">
      <Button variant="outline" className="h-10 w-full gap-2 rounded-2xl px-4 sm:w-auto">
        <Bell className="h-4 w-4" />
        {notifications.length > 0 ? `${notifications.length} avisos` : "Sin avisos"}
      </Button>
    </InstantLink>
  )
}

function NotificationShortcutFallback() {
  return (
    <Button variant="outline" className="h-10 w-full gap-2 rounded-2xl px-4 sm:w-auto">
      <Bell className="h-4 w-4" />
      Avisos
    </Button>
  )
}

export function AppShell({
  children,
  profile
}: {
  children: React.ReactNode
  profile: Profile
}) {
  return (
    <div className="min-h-screen bg-transparent">
      <div className="mobile-page-shell mx-auto grid min-h-screen max-w-[1600px] gap-5 lg:grid-cols-[248px_1fr] lg:px-6 lg:py-6">
        <aside className="page-section grid gap-2.5 border-trainium-dark/80 bg-trainium-dark p-2.5 text-white sm:gap-3 sm:p-3 md:grid-cols-[8.75rem_minmax(0,1fr)] md:items-stretch lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)] lg:flex-col lg:p-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-[1.05rem] border border-white/10 bg-white/[0.04] p-2.5 shadow-[0_10px_24px_rgba(7,17,29,0.24)] md:block md:p-3 lg:mb-1 lg:shrink-0 lg:p-4">
            <p className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60 lg:text-[11px] lg:tracking-[0.2em]">
              Gestion del gimnasio
            </p>
            <TenantLogo
              width={320}
              height={320}
              priority
              className="col-start-1 row-span-2 row-start-1 h-auto w-16 shrink-0 rounded-xl bg-white object-contain p-1.5 sm:w-20 md:mt-2 md:w-20 lg:mt-3 lg:w-36"
            />
            <Badge variant="default" className="w-fit px-2 py-0.5 text-[9px] tracking-[0.12em] md:mt-2 lg:mt-3 lg:px-2.5 lg:py-1 lg:text-[11px]">
              {profile.role === "admin" ? "Administrador" : "Entrenador"}
            </Badge>
          </div>

          <nav
            aria-label="Navegacion principal del gimnasio"
            className="staff-sidebar-nav-scroll grid grid-cols-4 gap-1.5 min-[520px]:grid-cols-5 sm:gap-2 md:grid-rows-2 lg:min-h-0 lg:flex-1 lg:grid-cols-1 lg:grid-rows-none lg:content-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1"
          >
            {navItems.map((item) => (
              <AppNavLink key={item.href} href={item.href} label={item.label} />
            ))}
          </nav>
        </aside>

        <main className="mobile-content-safe space-y-4 pb-4 sm:space-y-6 sm:pb-6">
          <header className="mobile-sticky-panel page-section app-page-header">
            <div className="app-page-header-copy">
              <p className="section-kicker">Operativa diaria</p>
              <div>
                <h2 className="app-page-header-title">Panel del equipo</h2>
                <p className="app-page-header-description">
                  Control rapido de actividad, alertas y accesos a las operaciones clave del dia.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
              <Suspense fallback={<NotificationShortcutFallback />}>
                <NotificationShortcut />
              </Suspense>
              <div className="toolbar-shell min-w-0 text-sm sm:min-w-[15rem]">
                <p className="font-semibold text-text-primary">{profile.fullName}</p>
                <p className="text-text-secondary">{profile.email}</p>
              </div>
              <form action={signOutAction}>
                <Button variant="ghost" className="h-10 w-full rounded-2xl px-4 sm:w-auto">
                  Salir
                </Button>
              </form>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  )
}
