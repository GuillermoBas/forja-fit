import Link from "next/link"
import { Suspense } from "react"
import { ArrowUpRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/page-header"
import { InstallTrainium } from "@/components/pwa/install-trainium"
import { KpiGridSkeleton, CardListSkeleton } from "@/components/skeletons"
import { DashboardKpiListModals } from "@/features/dashboard/dashboard-kpi-list-modals"
import { getDashboardData } from "@/lib/data"
import { formatDate } from "@/lib/utils"

const shortcuts = [
  { href: "/clients", label: "Nuevo cliente" },
  { href: "/passes", label: "Crear bono" },
  { href: "/sales", label: "Registrar venta" },
  { href: "/agenda", label: "Agendar sesion" }
]

function getChannelBadgeMeta(channel: "internal" | "email" | "push") {
  switch (channel) {
    case "push":
      return { label: "App", variant: "success" as const }
    case "email":
      return { label: "E-mail", variant: "secondary" as const }
    default:
      return { label: "Interna", variant: "default" as const }
  }
}

function DashboardDataFallback() {
  return (
    <div className="space-y-6">
      <KpiGridSkeleton count={6} />
      <section className="grid gap-6 xl:grid-cols-2">
        <CardListSkeleton items={3} />
        <CardListSkeleton items={3} />
      </section>
    </div>
  )
}

async function DashboardData() {
  const { kpis, passLists, notifications } = await getDashboardData()

  return (
    <>
      <DashboardKpiListModals kpis={kpis} passLists={passLists} />

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader className="pb-4">
            <p className="section-kicker">Navegacion</p>
            <CardTitle>Accesos rapidos</CardTitle>
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
          <CardContent className="max-h-[46rem] space-y-3.5 overflow-y-auto pr-2">
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
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(item.channels ?? [item.channel]).map((channel) => {
                      const meta = getChannelBadgeMeta(channel)
                      return (
                        <Badge key={`${item.id}-${channel}`} variant={meta.variant}>
                          {meta.label}
                        </Badge>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{item.message}</p>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p className="empty-state-title">Todo al dia</p>
                <p className="empty-state-copy">
                  No hay notificaciones recientes. Las renovaciones y avisos apareceran aqui.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  )
}

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Panel"
        description="Resumen diario del negocio, los bonos y las alertas pendientes."
      />

      <InstallTrainium />

      <Suspense fallback={<DashboardDataFallback />}>
        <DashboardData />
      </Suspense>
    </div>
  )
}
