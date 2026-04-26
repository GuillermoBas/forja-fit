import Link from "next/link"
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
import { appConfig } from "@/lib/config"
import { getNotifications } from "@/lib/data"
import { signOutAction } from "@/features/auth/actions"
import { AppNavLink } from "@/components/app-nav-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Profile } from "@/types/domain"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/passes", label: "Bonos", icon: ClipboardList },
  { href: "/products", label: "Productos", icon: ShoppingBag },
  { href: "/sales", label: "Ventas", icon: CreditCard },
  { href: "/expenses", label: "Gastos", icon: Wallet },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/reports", label: "Informes", icon: ClipboardList },
  { href: "/notifications", label: "Notificaciones", icon: Bell },
  { href: "/settings", label: "Ajustes", icon: Settings }
]

export async function AppShell({
  children,
  profile
}: {
  children: React.ReactNode
  profile: Profile
}) {
  const notifications = await getNotifications()
  return (
    <div className="min-h-screen bg-transparent">
      <div className="mobile-page-shell mx-auto grid min-h-screen max-w-[1600px] gap-5 lg:grid-cols-[292px_1fr] lg:px-6 lg:py-6">
        <aside className="page-section flex flex-col bg-surface/98 p-3.5 sm:p-4 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:p-5">
          <div className="mb-4 rounded-[1.3rem] border border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.92))] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] sm:mb-6 sm:p-5">
            <p className="section-kicker">Gestion del gimnasio</p>
            <h1 className="mt-2.5 font-heading text-[1.7rem] font-bold tracking-tight text-text-primary sm:mt-3 sm:text-[2rem]">
              {appConfig.businessName}
            </h1>
            <p className="mt-2 text-[13px] leading-6 text-text-secondary sm:text-sm">
              Plataforma operativa para entrenadores personales y administracion diaria.
            </p>
            <Badge variant="default" className="mt-3.5 w-fit sm:mt-4">
              {profile.role === "admin" ? "Administrador" : "Entrenador"}
            </Badge>
          </div>

          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-2 lg:overflow-visible lg:px-0">
            {navItems.map((item) => {
              return <AppNavLink key={item.href} href={item.href} label={item.label} />
            })}
          </nav>
        </aside>

        <main className="mobile-content-safe space-y-4 pb-4 sm:space-y-6 sm:pb-6">
          <header className="mobile-sticky-panel page-section app-page-header">
            <div className="app-page-header-copy">
              <p className="section-kicker">Operativa diaria</p>
              <div>
                <h2 className="app-page-header-title">
                  Panel del equipo
                </h2>
                <p className="app-page-header-description">
                  Control rapido de actividad, alertas y accesos a las operaciones clave del dia.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
              <Link href="/notifications">
                <Button variant="outline" className="h-10 w-full gap-2 rounded-2xl px-4 sm:w-auto">
                  <Bell className="h-4 w-4" />
                  {notifications.length > 0 ? `${notifications.length} avisos` : "Sin avisos"}
                </Button>
              </Link>
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
