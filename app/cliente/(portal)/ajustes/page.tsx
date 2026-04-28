import { Suspense } from "react"
import { FormPanelSkeleton } from "@/components/skeletons"
import { PortalAdvancedSettingsActions, PortalSettingsForm } from "@/features/client-portal/settings-form"
import { getPortalShellData } from "@/features/client-portal/data"
import { getPortalNutritionData } from "@/features/client-portal/nutrition/server"
import { PushNotificationSettings } from "@/features/client-portal/push/push-notification-settings"
import { getPortalPushSettingsData } from "@/features/client-portal/push/server"

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
  const [shellData, nutritionData, pushData] = await Promise.all([
    getPortalShellData(),
    getPortalNutritionData(),
    getPortalPushSettingsData()
  ])

  return (
    <div className="space-y-5">
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
    <Suspense fallback={<SettingsFallback />}>
      <SettingsData />
    </Suspense>
  )
}
