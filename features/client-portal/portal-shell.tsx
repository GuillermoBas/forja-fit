import { Suspense } from "react"
import { NutritionAssistantEntrypoint } from "@/features/client-portal/nutrition/assistant-entrypoint"
import { PortalShellChrome } from "@/features/client-portal/portal-shell-chrome"

export function PortalShell({
  children,
  clientName
}: {
  children: React.ReactNode
  clientName: string
}) {
  return (
    <PortalShellChrome clientName={clientName}>
      {children}
      <Suspense fallback={null}>
        <NutritionAssistantEntrypoint />
      </Suspense>
    </PortalShellChrome>
  )
}
