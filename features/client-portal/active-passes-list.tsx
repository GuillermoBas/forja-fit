import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"
import type { PortalPassSummary } from "@/features/client-portal/data"

export function ActivePassesList({
  passes
}: {
  passes: PortalPassSummary[]
}) {
  return (
    <Card className="panel-hover">
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6">
        <CardTitle className="text-base sm:text-lg">Bonos activos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
        {passes.length ? (
          passes.map((pass) => (
            <div
              key={pass.id}
              className="rounded-2xl border border-border/70 bg-surface-alt/70 p-3 text-sm sm:p-4"
            >
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p className="font-medium text-text-primary">{pass.passTypeName}</p>
                <p className="text-[13px] leading-5 text-text-secondary sm:text-sm">Caduca {formatDate(pass.expiresOn)}</p>
              </div>
              <p className="mt-2 text-[13px] leading-5 text-text-secondary sm:text-sm">{pass.holderSummary}</p>
              <p className="mt-2 text-[13px] leading-5 text-text-secondary sm:text-sm">
                {pass.passKind === "monthly"
                  ? "Bono mensual activo"
                  : `Sesiones restantes: ${pass.sessionsLeft ?? 0}`}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-text-secondary">No hay bonos activos en este momento.</p>
        )}
      </CardContent>
    </Card>
  )
}
