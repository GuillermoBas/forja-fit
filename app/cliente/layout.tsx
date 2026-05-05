import { ClientPortalPersistentShell } from "@/features/client-portal/persistent-shell"
import { NutritionAssistantSlot } from "@/features/client-portal/nutrition/assistant-slot"

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientPortalPersistentShell assistant={<NutritionAssistantSlot />}>
      {children}
    </ClientPortalPersistentShell>
  )
}
