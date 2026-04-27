import { Suspense } from "react"
import { FormPanelSkeleton } from "@/components/skeletons"
import { PortalShell } from "@/features/client-portal/portal-shell"
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

export default async function ClientPortalSettingsPage() {
  const shellData = await getPortalShellData()

  return (
    <PortalShell
      title="Ajustes"
      description="Gestiona tus datos personales, datos del historial de nutricion y los ajustes de notificaciones push."
      clientName={shellData.client.fullName}
      currentPath="/cliente/ajustes"
    >
      <Suspense fallback={<SettingsFallback />}>
        <SettingsData />
      </Suspense>
    </PortalShell>
  )
}
