import { Suspense } from "react"
import { CardListSkeleton, FormPanelSkeleton } from "@/components/skeletons"
import { PortalShellMeta } from "@/features/client-portal/persistent-shell"
import { NutritionAssistantEntrypoint } from "@/features/client-portal/nutrition/assistant-entrypoint"
import { NutritionChat } from "@/features/client-portal/nutrition/chat"
import { getPortalNutritionData } from "@/features/client-portal/nutrition/server"
import { WeeklyNutritionPlansList } from "@/features/client-portal/nutrition/weekly-plans-list"

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
      <PortalShellMeta clientName={data.client.fullName} />
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

export default function ClientPortalNutritionPage() {
  return (
    <>
      <Suspense fallback={<NutritionFallback />}>
        <NutritionData />
      </Suspense>
      <Suspense fallback={null}>
        <NutritionAssistantEntrypoint />
      </Suspense>
    </>
  )
}
