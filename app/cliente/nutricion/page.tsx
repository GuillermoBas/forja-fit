import { Suspense } from "react"
import { CardListSkeleton, FormPanelSkeleton } from "@/components/skeletons"
import { Card } from "@/components/ui/card"
import { PortalShellMeta } from "@/features/client-portal/persistent-shell"
import { getPortalNutritionData } from "@/features/client-portal/nutrition/server"
import { WeeklyNutritionPlansList } from "@/features/client-portal/nutrition/weekly-plans-list"
import { PortalContentError } from "@/features/client-portal/portal-content-error"
import { NutritionAssistantSlot } from "@/features/client-portal/nutrition/assistant-slot"
import { isNextControlError } from "@/lib/next-control-errors"

function NutritionFallback() {
  return (
    <div className="space-y-4">
      <FormPanelSkeleton fields={2} />
      <CardListSkeleton items={3} />
    </div>
  )
}

async function NutritionData() {
  let data

  try {
    data = await getPortalNutritionData()
  } catch (error) {
    if (isNextControlError(error)) {
      throw error
    }

    console.error("Portal nutrition load failed", error)
    return <PortalContentError title="No se pudo cargar nutricion" />
  }

  return (
    <section className="space-y-4">
      <PortalShellMeta clientName={data.client.fullName} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="rounded-[1.35rem] border border-border/80 bg-surface-alt/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Hoy</p>
          <p className="mt-1 text-base font-semibold text-text-primary">
            {data.quota.dailyUsed}/{data.quota.dailyLimit} usados
          </p>
          <p className="text-sm text-text-secondary">
            Quedan {data.quota.dailyRemaining} mensajes
          </p>
        </Card>
        <Card className="rounded-[1.35rem] border border-border/80 bg-surface-alt/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Mes</p>
          <p className="mt-1 text-base font-semibold text-text-primary">
            {data.quota.monthlyUsed}/{data.quota.monthlyLimit} usados
          </p>
          <p className="text-sm text-text-secondary">
            Quedan {data.quota.monthlyRemaining} mensajes
          </p>
        </Card>
      </div>

      <WeeklyNutritionPlansList plans={data.savedPlans} />
    </section>
  )
}

export default function ClientPortalNutritionPage() {
  return (
    <>
      <Suspense fallback={<NutritionFallback />}>
        <NutritionData />
      </Suspense>
      <NutritionAssistantSlot />
    </>
  )
}
