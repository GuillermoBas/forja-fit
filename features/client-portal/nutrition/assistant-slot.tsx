import { Suspense } from "react"
import { NutritionAssistantEntrypoint } from "@/features/client-portal/nutrition/assistant-entrypoint"

export function NutritionAssistantSlot() {
  return (
    <Suspense fallback={null}>
      <NutritionAssistantEntrypoint />
    </Suspense>
  )
}
