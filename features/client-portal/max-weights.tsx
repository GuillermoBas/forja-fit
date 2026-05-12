import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  buildClientMaxWeightSummary,
  formatChangeSincePrevious,
  formatKg,
  formatKgWithUnit,
  formatShortDate,
  formatWeightChange,
  getEntriesForMetric,
  getMaxWeightStats,
  getMetricsWithEntries
} from "@/features/strength-metrics/client-max-weight-summary"
import { cn, formatDate } from "@/lib/utils"
import type { ClientMaxWeightEntry, StrengthMetric } from "@/types/domain"

function MaxWeightLineChart({ entries }: { entries: ClientMaxWeightEntry[] }) {
  if (!entries.length) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed p-4 text-center text-sm text-text-secondary">
        Todavía no hay pesos máximos registrados.
      </div>
    )
  }

  const values = entries.map((entry) => entry.valueKg)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueRange = Math.max(maxValue - minValue, 1)
  const width = 640
  const height = 220
  const paddingX = 42
  const paddingY = 24
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingY * 2
  const points = entries.map((entry, index) => {
    const x = entries.length === 1
      ? paddingX + chartWidth / 2
      : paddingX + (index / (entries.length - 1)) * chartWidth
    const y = paddingY + ((maxValue - entry.valueKg) / valueRange) * chartHeight

    return { entry, x, y }
  })
  const pathData = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")

  return (
    <div className="rounded-2xl border border-border/80 bg-surface-alt/40 p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Evolución histórica de pesos máximos"
        className="h-56 w-full"
      >
        <line x1={paddingX} y1={paddingY} x2={paddingX} y2={height - paddingY} className="stroke-border" />
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} className="stroke-border" />
        <text x={paddingX - 10} y={paddingY + 4} textAnchor="end" className="fill-text-secondary text-[11px]">
          {formatKg(maxValue)}
        </text>
        <text x={paddingX - 10} y={height - paddingY + 4} textAnchor="end" className="fill-text-secondary text-[11px]">
          {formatKg(minValue)}
        </text>
        {entries.length > 1 ? (
          <path d={pathData} fill="none" className="stroke-primary" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {points.map((point) => (
          <circle key={point.entry.id} cx={point.x} cy={point.y} r="6" className="fill-primary stroke-white" strokeWidth="3">
            <title>{`${formatDate(point.entry.entryDate)} - ${formatKgWithUnit(point.entry.valueKg)}`}</title>
          </circle>
        ))}
        <text x={paddingX} y={height - 6} className="fill-text-secondary text-[11px]">
          {formatShortDate(entries[0]?.entryDate ?? "")}
        </text>
        <text x={width - paddingX} y={height - 6} textAnchor="end" className="fill-text-secondary text-[11px]">
          {formatShortDate(entries[entries.length - 1]?.entryDate ?? "")}
        </text>
      </svg>
      {entries.length === 1 ? (
        <p className="mt-2 text-sm text-text-secondary">
          Aún no hay suficientes registros para mostrar evolución.
        </p>
      ) : null}
    </div>
  )
}

export function PortalMaxWeightsDashboardCard({
  metrics,
  entries
}: {
  metrics: StrengthMetric[]
  entries: ClientMaxWeightEntry[]
}) {
  const activeMetricsWithData = getMetricsWithEntries(metrics, entries).filter((metric) => metric.isActive)
  const summary = buildClientMaxWeightSummary({ metrics: activeMetricsWithData, entries })
    .filter((item) => item.latestEntry)

  if (!summary.length) {
    return null
  }

  return (
    <Card className="panel-hover">
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base sm:text-lg">Mis pesos máximos</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/cliente/pesos-maximos" aria-label="Ver evolución de mis pesos máximos">
              Ver evolución
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0 xl:grid-cols-3">
        {summary.map((item) => (
          <div key={item.metric.id} className="rounded-2xl border border-border/80 bg-surface-alt/50 p-3 sm:p-4">
            <p className="text-sm font-medium text-text-secondary">{item.metric.name}</p>
            <p className="mt-2 font-heading text-2xl font-bold text-text-primary">
              {formatKgWithUnit(item.latestEntry?.valueKg ?? 0)}
            </p>
            <p className="mt-1 text-[13px] leading-5 text-text-secondary">
              Actualizado {formatDate(item.latestEntry?.entryDate ?? "")}
            </p>
            <p className="mt-2 text-sm font-semibold text-primary-hover">
              {formatChangeSincePrevious(item.changeKg, item.previousEntry)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function PortalMaxWeightsDetail({
  metrics,
  entries,
  selectedMetricId
}: {
  metrics: StrengthMetric[]
  entries: ClientMaxWeightEntry[]
  selectedMetricId?: string
}) {
  const metricsWithData = getMetricsWithEntries(metrics, entries)
  const selectedMetric = metricsWithData.find((metric) => metric.id === selectedMetricId)
    ?? metricsWithData[0]
    ?? null

  if (!metricsWithData.length || !selectedMetric) {
    return (
      <Card className="panel-hover">
        <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6">
          <CardTitle className="text-base sm:text-lg">Evolución de pesos máximos</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-sm text-text-secondary sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
          Todavía no tienes pesos máximos registrados. Tu entrenador podrá añadirlos cuando empieces el seguimiento.
        </CardContent>
      </Card>
    )
  }

  const selectedEntriesAsc = getEntriesForMetric(entries, selectedMetric.id, "asc")
  const selectedEntriesDesc = getEntriesForMetric(entries, selectedMetric.id, "desc")
  const stats = getMaxWeightStats(selectedEntriesAsc)

  return (
    <div className="space-y-4">
      <Card className="panel-hover">
        <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6">
          <CardTitle className="text-base sm:text-lg">Evolución de pesos máximos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-4 pt-0 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
          <nav aria-label="Seleccionar métrica de peso máximo" className="flex flex-wrap gap-2">
            {metricsWithData.map((metric) => {
              const active = metric.id === selectedMetric.id
              return (
                <Link
                  key={metric.id}
                  href={`/cliente/pesos-maximos?metric=${encodeURIComponent(metric.id)}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-text-secondary hover:border-primary/30 hover:text-text-primary"
                  )}
                >
                  {metric.name}
                </Link>
              )
            })}
          </nav>

          <section className="grid gap-3 sm:grid-cols-3" aria-label={`Resumen de ${selectedMetric.name}`}>
            <div className="rounded-2xl border border-border/80 bg-surface-alt/50 p-3 sm:p-4">
              <p className="text-sm text-text-secondary">Peso actual</p>
              <p className="mt-2 font-heading text-2xl font-bold text-text-primary">
                {stats.latestEntry ? formatKgWithUnit(stats.latestEntry.valueKg) : "Sin datos"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-surface-alt/50 p-3 sm:p-4">
              <p className="text-sm text-text-secondary">Mejor marca</p>
              <p className="mt-2 font-heading text-2xl font-bold text-text-primary">
                {stats.bestEntry ? formatKgWithUnit(stats.bestEntry.valueKg) : "Sin datos"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-surface-alt/50 p-3 sm:p-4">
              <p className="text-sm text-text-secondary">Progreso total</p>
              <p className="mt-2 font-heading text-2xl font-bold text-text-primary">
                {formatWeightChange(stats.totalProgressKg)}
              </p>
            </div>
          </section>

          <MaxWeightLineChart entries={selectedEntriesAsc} />
        </CardContent>
      </Card>

      <Card className="panel-hover">
        <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6">
          <CardTitle className="text-base sm:text-lg">Historial</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
          <div className="overflow-x-auto rounded-2xl border border-border/80">
            <table className="w-full min-w-[22rem] text-left text-sm">
              <thead className="bg-surface-alt/70 text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Peso</th>
                </tr>
              </thead>
              <tbody>
                {selectedEntriesDesc.map((entry) => (
                  <tr key={entry.id} className="border-t border-border/70">
                    <td className="px-4 py-3">{formatDate(entry.entryDate)}</td>
                    <td className="px-4 py-3 font-semibold">{formatKgWithUnit(entry.valueKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
