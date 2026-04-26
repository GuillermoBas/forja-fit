import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PortalChartPoint } from "@/features/client-portal/data"

export function ActivityChart({
  title,
  points
}: {
  title: string
  points: PortalChartPoint[]
}) {
  const maxValue = Math.max(...points.map((point) => point.value), 1)

  return (
    <Card className="panel-hover">
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6">
        <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 sm:space-y-4 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
        {points.length ? (
          <div className="space-y-3">
            {points.map((point) => (
              <div key={point.label} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-[13px] sm:text-sm">
                  <span className="min-w-0 truncate text-text-secondary">{point.label}</span>
                  <span className="font-semibold text-text-primary">{point.value}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface-alt">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(point.value / maxValue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No hay sesiones en el rango seleccionado.</p>
        )}
      </CardContent>
    </Card>
  )
}
