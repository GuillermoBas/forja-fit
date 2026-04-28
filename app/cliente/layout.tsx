import { Suspense } from "react"
import { ClientPortalPersistentShell } from "@/features/client-portal/persistent-shell"
import { NutritionAssistantEntrypoint } from "@/features/client-portal/nutrition/assistant-entrypoint"

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientPortalPersistentShell
      assistant={
        <Suspense fallback={null}>
          <NutritionAssistantEntrypoint />
        </Suspense>
      }
    >
      {children}
    </ClientPortalPersistentShell>
  )
}
