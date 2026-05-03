import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/utils"
import type { WeeklyNutritionPlan } from "@/features/client-portal/nutrition/server"

const dayLabels: Array<{ key: keyof WeeklyNutritionPlan["plan"]["days"]; label: string }> = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" }
]

export function WeeklyNutritionPlansList({
  plans
}: {
  plans: WeeklyNutritionPlan[]
}) {
  if (!plans.length) {
    return (
      <Card id="menu-semanal" className="panel-hover scroll-mt-4">
        <CardHeader>
          <CardTitle>Menús semanales guardados</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">
            Aún no has guardado ningún menú semanal. Pídele al asistente un menú semanal cuando quieras conservarlo.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div id="menu-semanal" className="scroll-mt-4 space-y-3 sm:space-y-4">
      {plans.map((plan) => (
        <Card key={plan.id} className="panel-hover">
          <CardHeader className="space-y-2 p-4 sm:p-5 lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base sm:text-lg">{plan.title}</CardTitle>
                <p className="mt-2 text-[13px] leading-5 text-text-secondary sm:text-sm">
                  Semana del {formatDate(plan.weekStartsOn)}. Guardado {formatDate(plan.createdAt)}.
                </p>
              </div>
            </div>
            <p className="text-[13px] leading-5 text-text-secondary sm:text-sm">{plan.plan.weekGoal}</p>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:space-y-4 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
            {plan.plan.notes ? (
              <div className="rounded-2xl border border-border/70 bg-surface-alt/60 px-3 py-3 text-[13px] leading-5 text-text-secondary sm:text-sm">
                {plan.plan.notes}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              {dayLabels.map((day) => {
                const entry = plan.plan.days[day.key]
                return (
                  <div key={day.key} className="rounded-2xl border border-border/70 bg-surface-alt/50 p-3">
                    <p className="text-sm font-semibold text-text-primary">{day.label}</p>
                    {entry.focus ? (
                      <p className="mt-1 text-xs text-text-secondary">Enfoque: {entry.focus}</p>
                    ) : null}
                    <div className="mt-3 space-y-2">
                      {entry.meals.map((meal, index) => (
                        <div key={`${day.key}-${index}`} className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                            {meal.title}
                          </p>
                          <p className="mt-1 text-sm text-text-secondary">{meal.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {plan.plan.shoppingList.length ? (
              <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-3">
                <p className="text-sm font-semibold text-text-primary">Lista de compra</p>
                <p className="mt-2 text-sm text-text-secondary">
                  {plan.plan.shoppingList.join(", ")}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
