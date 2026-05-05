import { NutritionFloatingAssistant } from "@/features/client-portal/nutrition/floating-assistant"
import { getPortalNutritionData } from "@/features/client-portal/nutrition/server"
import { isNextControlError } from "@/lib/next-control-errors"

export async function NutritionAssistantEntrypoint() {
  let nutritionData

  try {
    nutritionData = await getPortalNutritionData()
  } catch (error) {
    if (isNextControlError(error)) {
      throw error
    }

    console.error("Portal nutrition assistant unavailable", error)
    return null
  }

  return (
    <NutritionFloatingAssistant
      initialMessages={nutritionData.messages}
      initialThreadId={nutritionData.threadId}
      clientFirstName={nutritionData.client.firstName ?? nutritionData.client.fullName}
      initialQuota={nutritionData.quota}
    />
  )
}
