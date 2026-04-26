import { PortalShell } from "@/features/client-portal/portal-shell"
import { PortalAdvancedSettingsActions, PortalSettingsForm } from "@/features/client-portal/settings-form"
import { getPortalDashboardData } from "@/features/client-portal/data"
import { getPortalNutritionData } from "@/features/client-portal/nutrition/server"
import { PushNotificationSettings } from "@/features/client-portal/push/push-notification-settings"
import { getPortalPushSettingsData } from "@/features/client-portal/push/server"

export default async function ClientPortalSettingsPage() {
  const [data, nutritionData, pushData] = await Promise.all([
    getPortalDashboardData(),
    getPortalNutritionData(),
    getPortalPushSettingsData()
  ])

  return (
    <PortalShell
      title="Ajustes"
      description="Gestiona tus datos personales, datos del historial de nutrición y los ajustes de notificaciones push."
      clientName={data.client.fullName}
      currentPath="/cliente/ajustes"
    >
      <div className="space-y-5">
        <PortalSettingsForm client={data.client} />
        <PushNotificationSettings
          vapidPublicKey={pushData.vapidPublicKey}
          initialPreferences={pushData.preferences}
        />
        <PortalAdvancedSettingsActions savedPlanCount={nutritionData.savedPlans.length} />
      </div>
    </PortalShell>
  )
}
