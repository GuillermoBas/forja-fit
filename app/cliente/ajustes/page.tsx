import { PortalShell } from "@/features/client-portal/portal-shell"
import { PortalSettingsForm } from "@/features/client-portal/settings-form"
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
      title="Tus ajustes"
      description="Gestiona tu telefono de contacto sin alterar la identidad verificada del portal."
      clientName={data.client.fullName}
      currentPath="/cliente/ajustes"
    >
      <div className="space-y-5">
        <PortalSettingsForm client={data.client} savedPlanCount={nutritionData.savedPlans.length} />
        <PushNotificationSettings
          vapidPublicKey={pushData.vapidPublicKey}
          initialPreferences={pushData.preferences}
        />
      </div>
    </PortalShell>
  )
}
