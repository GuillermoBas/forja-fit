import { Suspense } from "react"
import { FormPanelSkeleton } from "@/components/skeletons"
import { PortalShellMeta } from "@/features/client-portal/persistent-shell"
import { PortalAdvancedSettingsActions, PortalSettingsForm } from "@/features/client-portal/settings-form"
import { getPortalShellData } from "@/features/client-portal/data"
import { getPortalNutritionData } from "@/features/client-portal/nutrition/server"
import { PushNotificationSettings } from "@/features/client-portal/push/push-notification-settings"
import { getPortalPushSettingsData } from "@/features/client-portal/push/server"
import { PortalContentError } from "@/features/client-portal/portal-content-error"
import { NutritionAssistantSlot } from "@/features/client-portal/nutrition/assistant-slot"
import { isNextControlError } from "@/lib/next-control-errors"

function SettingsFallback() {
  return (
    <div className="space-y-5">
      <FormPanelSkeleton fields={4} />
      <FormPanelSkeleton fields={3} />
      <FormPanelSkeleton fields={2} />
    </div>
  )
}

async function SettingsData() {
  let shellData
  let nutritionData
  let pushData

  try {
    ;[shellData, nutritionData, pushData] = await Promise.all([
      getPortalShellData(),
      getPortalNutritionData(),
      getPortalPushSettingsData()
    ])
  } catch (error) {
    if (isNextControlError(error)) {
      throw error
    }

    console.error("Portal settings load failed", error)
    return <PortalContentError title="No se pudieron cargar los ajustes" />
  }

  return (
    <div className="space-y-5">
      <PortalShellMeta clientName={shellData.client.fullName} />
      <PortalSettingsForm client={shellData.client} />
      <PushNotificationSettings
        vapidPublicKey={pushData.vapidPublicKey}
        initialPreferences={pushData.preferences}
      />
      <PortalAdvancedSettingsActions savedPlanCount={nutritionData.savedPlans.length} />
    </div>
  )
}

export default function ClientPortalSettingsPage() {
  return (
    <>
      <Suspense fallback={<SettingsFallback />}>
        <SettingsData />
      </Suspense>
      <NutritionAssistantSlot />
    </>
  )
}
