import { Suspense } from "react"
import { Bell } from "lucide-react"
import { appConfig } from "@/lib/config"
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
        <aside className="page-section flex flex-col bg-surface/98 p-3.5 sm:p-4 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:p-4">
          <div className="mb-3 rounded-[1.2rem] border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))] p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] sm:mb-4 sm:p-4">
            <p className="section-kicker">Gestion del gimnasio</p>
            <h1 className="mt-2 font-heading text-[1.55rem] font-bold tracking-tight text-text-primary sm:text-[1.8rem]">
              {appConfig.businessName}
            </h1>
            <Badge variant="default" className="mt-3 w-fit">
              {profile.role === "admin" ? "Administrador" : "Entrenador"}
            </Badge>
          </div>

          <nav
            aria-label="Navegacion principal del gimnasio"
            className="-mx-1 grid grid-flow-col auto-cols-[4.8rem] gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-1 lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-1 lg:overflow-visible lg:px-0 lg:pb-0"
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
