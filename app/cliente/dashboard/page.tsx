import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InstallForjaFit } from "@/components/pwa/install-forjafit"
import { PortalShell } from "@/features/client-portal/portal-shell"
import { ActivityChart } from "@/features/client-portal/activity-chart"
import { ActivityHistoryList } from "@/features/client-portal/activity-history-list"
import { ActivityRangeLinks } from "@/features/client-portal/activity-range-links"
import { ActivePassesList } from "@/features/client-portal/active-passes-list"
import { getPortalDashboardData } from "@/features/client-portal/data"

export default async function ClientPortalDashboardPage({
  searchParams
}: {
  searchParams?: { range?: string }
}) {
  const data = await getPortalDashboardData(searchParams?.range)
  const monthlyConsistencyPercent = Math.round(data.kpis.monthlyConsistency.ratio * 100)

  return (
    <PortalShell
      title="Actividad"
      description="Resumen de entrenamientos, regularidad y bonos vigentes."
      clientName={data.client.fullName}
      currentPath="/cliente/dashboard"
    >
      <InstallForjaFit />

      <div className="flex flex-col gap-2.5 sm:gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h3 className="font-heading text-[1.35rem] font-bold text-text-primary sm:text-[1.55rem] lg:text-2xl">
            Hola {data.client.firstName ?? data.client.fullName}
          </h3>
        </div>
        <div className="w-full max-w-full lg:w-auto lg:max-w-none">
          <ActivityRangeLinks
            basePath="/cliente/dashboard"
            currentRange={data.rangeDays}
            ranges={data.availableRanges}
          />
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:gap-4 xl:grid-cols-3">
        <Card className="panel-hover">
          <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6"><CardTitle className="text-base sm:text-lg">Sesiones en 30 días</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 font-heading text-[2rem] font-bold sm:p-5 sm:pt-0 sm:text-[2.2rem] lg:p-6 lg:pt-0 lg:text-3xl">{data.kpis.sessionsLast30Days}</CardContent>
        </Card>
        <Card className="panel-hover">
          <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6"><CardTitle className="text-base sm:text-lg">Racha actual</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 font-heading text-[2rem] font-bold sm:p-5 sm:pt-0 sm:text-[2.2rem] lg:p-6 lg:pt-0 lg:text-3xl">{data.kpis.currentStreakWeeks} semanas</CardContent>
        </Card>
        <Card className="panel-hover">
          <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6"><CardTitle className="text-base sm:text-lg">Consistencia mensual</CardTitle></CardHeader>
          <CardContent className="space-y-2 p-4 pt-0 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
            <div className="font-heading text-[2rem] font-bold sm:text-[2.2rem] lg:text-3xl">{monthlyConsistencyPercent}%</div>
            <p className="text-[13px] leading-5 text-text-secondary sm:text-sm">
              {data.kpis.monthlyConsistency.activeWeeks} de {data.kpis.monthlyConsistency.elapsedWeeks} semanas activas este mes
            </p>
          </CardContent>
        </Card>
        <Card className="panel-hover">
          <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6"><CardTitle className="text-base sm:text-lg">Sesiones restantes</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 font-heading text-[2rem] font-bold sm:p-5 sm:pt-0 sm:text-[2.2rem] lg:p-6 lg:pt-0 lg:text-3xl">{data.kpis.sessionsRemaining}</CardContent>
        </Card>
        <Card className="panel-hover">
          <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6"><CardTitle className="text-base sm:text-lg">Próxima caducidad</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 font-heading text-[2rem] font-bold sm:p-5 sm:pt-0 sm:text-[2.2rem] lg:p-6 lg:pt-0 lg:text-3xl">
            {data.kpis.daysUntilNearestExpiry === null ? "Sin caducidad" : `${data.kpis.daysUntilNearestExpiry} días`}
          </CardContent>
        </Card>
        <Card className="panel-hover">
          <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6"><CardTitle className="text-base sm:text-lg">Delta mensual</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0 font-heading text-[2rem] font-bold sm:p-5 sm:pt-0 sm:text-[2.2rem] lg:p-6 lg:pt-0 lg:text-3xl">
            {data.kpis.monthOverMonthDelta > 0 ? "+" : ""}{data.kpis.monthOverMonthDelta}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <ActivityChart
          title={`Sesiones por semana en los últimos ${data.rangeDays} días`}
          points={data.chart}
        />
        <ActivePassesList passes={data.activePasses} />
      </section>

      <ActivityHistoryList
        title="Historial reciente"
        items={data.history.slice(0, 6)}
        emptyMessage="No hay movimientos recientes en el rango seleccionado."
      />
    </PortalShell>
  )
}
