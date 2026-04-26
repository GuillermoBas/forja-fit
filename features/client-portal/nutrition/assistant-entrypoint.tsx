import { NutritionFloatingAssistant } from "@/features/client-portal/nutrition/floating-assistant"
import { getPortalNutritionData } from "@/features/client-portal/nutrition/server"

export async function NutritionAssistantEntrypoint() {
  const nutritionData = await getPortalNutritionData()

  return (
    <NutritionFloatingAssistant
      initialMessages={nutritionData.messages}
      initialThreadId={nutritionData.threadId}
      clientFirstName={nutritionData.client.firstName ?? nutritionData.client.fullName}
      initialQuota={nutritionData.quota}
    />
  )
}
