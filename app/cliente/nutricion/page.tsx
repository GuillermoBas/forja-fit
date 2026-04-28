import { Suspense } from "react"
import { CardListSkeleton, FormPanelSkeleton } from "@/components/skeletons"
import { PortalShell } from "@/features/client-portal/portal-shell"
import { NutritionChat } from "@/features/client-portal/nutrition/chat"
import { getPortalNutritionData } from "@/features/client-portal/nutrition/server"
import { WeeklyNutritionPlansList } from "@/features/client-portal/nutrition/weekly-plans-list"
import { getPortalShellData } from "@/features/client-portal/data"

function NutritionFallback() {
  return (
    <div className="space-y-4">
      <FormPanelSkeleton fields={2} />
      <CardListSkeleton items={3} />
    </div>
  )
}

async function NutritionData() {
  const data = await getPortalNutritionData()

  return (
    <section className="space-y-4">
      <div className="max-w-3xl">
        <h3 className="font-heading text-[1.35rem] font-bold text-text-primary sm:text-[1.55rem] lg:text-2xl">
          Asistente nutricional
        </h3>
        <p className="mt-2 text-[13px] leading-5 text-text-secondary sm:text-sm sm:leading-6">
          El onboarding inicial sucede en la propia conversacion. Empieza contando tu objetivo, tus horarios o cualquier restriccion alimentaria que quieras tener en cuenta. Tambien puedes abrir este mismo chat desde el acceso flotante fijo en cualquier pantalla del area cliente.
        </p>
      </div>

      <NutritionChat
        initialMessages={data.messages}
        initialThreadId={data.threadId}
        clientFirstName={data.client.firstName ?? data.client.fullName}
        initialQuota={data.quota}
        mode="page"
      />

      <WeeklyNutritionPlansList plans={data.savedPlans} />
    </section>
  )
}

export default async function ClientPortalNutritionPage() {
  const shellData = await getPortalShellData()

  return (
    <PortalShell
      title="Nutricion"
      description="Habla con el asistente IA de nutricion y conserva el historial de la conversacion en tu portal."
      clientName={shellData.client.fullName}
      currentPath="/cliente/nutricion"
    >
      <Suspense fallback={<NutritionFallback />}>
        <NutritionData />
      </Suspense>
    </PortalShell>
  )
}
