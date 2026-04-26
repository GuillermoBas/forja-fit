import Link from "next/link"
import { AlertTriangle, ArrowUpRight, BellRing, Box, CalendarClock, Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { InstallForjaFit } from "@/components/pwa/install-forjafit"
import { getDashboardData } from "@/lib/data"
import { cn } from "@/lib/utils"
import { formatCurrency, formatDate } from "@/lib/utils"

const shortcuts = [
  { href: "/clients", label: "Nuevo cliente" },
  { href: "/passes", label: "Crear bono" },
  { href: "/sales", label: "Registrar venta" },
  { href: "/agenda", label: "Agendar sesión" }
]

const kpiIcons = [CalendarClock, AlertTriangle, ArrowUpRight, Box, Wallet, BellRing, Wallet]

export default async function DashboardPage() {
  const { kpis, notifications } = await getDashboardData()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Panel"
        description="Resumen diario del negocio, los bonos y las alertas pendientes."
      />

      <InstallForjaFit />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((item, index) => {
          const Icon = kpiIcons[index % kpiIcons.length]
          const isAlert = item.label.includes("Caducan") || item.label.includes("Stock")
          const isMoney = item.label.includes("Ventas")
          const cardTone = isAlert
            ? "border-warning/18 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(255,247,237,0.98))]"
            : isMoney
              ? "border-success/18 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(240,253,244,0.98))]"
              : "border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.98))]"

          return (
            <Card key={item.label} className={cn("panel-hover overflow-hidden", cardTone)}>
              <CardHeader className="relative pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <p className="metric-label">
                      {isMoney ? "Facturación" : isAlert ? "Atención" : "Resumen"}
                    </p>
                    <CardTitle className="text-[15px] font-semibold text-text-secondary">
                      {item.label}
                    </CardTitle>
                  </div>
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                      isAlert
                        ? "border-warning/18 bg-warning/10 text-warning"
                        : isMoney
                          ? "border-success/18 bg-success/10 text-success"
                          : "border-primary/18 bg-primary-soft text-primary-hover"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="kpi-value">
                  {item.label.includes("Ventas") ? formatCurrency(Number(item.value)) : item.value}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isAlert ? "bg-warning" : isMoney ? "bg-success" : "bg-primary"
                    )}
                  />
                  <p className="kpi-meta">
                    {isMoney
                      ? "Facturación registrada"
                      : isAlert
                        ? "Requiere seguimiento"
                        : "Estado operativo"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader className="pb-4">
            <p className="section-kicker">Navegación</p>
            <CardTitle>Accesos rápidos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3.5 sm:grid-cols-2">
            {shortcuts.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-border/90 bg-surface-alt px-4 py-4 text-sm font-medium text-text-primary transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-surface"
              >
                <span className="flex items-center justify-between gap-4">
                  {item.label}
                  <ArrowUpRight className="h-4 w-4 text-primary-hover transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <p className="section-kicker">Actividad</p>
            <CardTitle>Notificaciones recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {notifications.length ? (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-primary/15 bg-primary-soft/55 p-4 transition-colors duration-200 hover:border-primary/25 hover:bg-primary-soft/75"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-semibold text-text-primary">{item.clientName ?? "Sistema"}</p>
                    <span className="text-xs text-text-muted">{formatDate(item.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{item.message}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p className="empty-state-title">Todo al día</p>
                <p className="empty-state-copy">
                  No hay notificaciones recientes. Las renovaciones y avisos aparecerán aquí.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
