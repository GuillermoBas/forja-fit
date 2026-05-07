import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BlockedState } from "@/components/blocked-state"
import { PageHeader } from "@/components/page-header"
import { DailyExpiryScanForm } from "@/features/notifications/notification-forms"
import { InstallPwaCard } from "@/features/settings/install-pwa-card"
import { BusinessSettingsCard } from "@/features/settings/business-settings-card"
import { ManualPushCard } from "@/features/settings/manual-push-card"
import { ManualClientPortalActivationCard } from "@/features/settings/manual-client-portal-activation-card"
import { ProfileColorForm } from "@/features/settings/profile-color-form"
import { StaffManagementCard } from "@/features/settings/staff-management-card"
import { getCurrentAccessToken, requireAuthenticatedProfile } from "@/lib/auth/session"
import { getBusinessSettings, getClients, getStaffProfiles } from "@/lib/data"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { isStaffPreview } from "@/lib/preview-mode"
import { getCurrentGym } from "@/lib/tenant"

type ManualPushClientRow = {
  id: string
  label: string
}

async function getManualPushClients(): Promise<ManualPushClientRow[]> {
  if (await isStaffPreview()) {
    return [
      {
        id: "preview-client-guillermo",
        label: "Guillermo Bas Portal - 1 dispositivo activo"
      }
    ]
  }

  const accessToken = await getCurrentAccessToken()

  if (!accessToken) {
    return []
  }
  const gym = await getCurrentGym()
  if (!gym) {
    return []
  }

  const client = createServerInsforgeClient({ accessToken }) as any
  const portalAccountsResult = await client.database
    .from("client_portal_accounts")
    .select("id,client_id,status")
    .eq("gym_id", gym.id)
    .eq("status", "claimed")

  if (portalAccountsResult.error || !portalAccountsResult.data?.length) {
    return []
  }

  const portalAccounts = portalAccountsResult.data as Array<{ id: string; client_id: string }>
  const clientIds = portalAccounts.map((row) => row.client_id)
  const portalAccountIds = portalAccounts.map((row) => row.id)

  const [clientsResult, subscriptionsResult] = await Promise.all([
    client.database.from("clients").select("id,first_name,last_name").eq("gym_id", gym.id).in("id", clientIds),
    client.database
      .from("push_subscriptions")
      .select("client_portal_account_id,is_active")
      .eq("gym_id", gym.id)
      .in("client_portal_account_id", portalAccountIds)
      .eq("is_active", true)
  ])

  if (clientsResult.error || !clientsResult.data) {
    return []
  }

  const clientIdByPortalAccountId = new Map(
    portalAccounts.map((row) => [String(row.id), String(row.client_id)])
  )

  const activeCounts = new Map<string, number>()
  for (const row of (subscriptionsResult.data ?? []) as Array<{ client_portal_account_id: string }>) {
    const clientId = clientIdByPortalAccountId.get(String(row.client_portal_account_id)) ?? ""
    activeCounts.set(clientId, (activeCounts.get(clientId) ?? 0) + 1)
  }

  return (clientsResult.data as Array<{ id: string; first_name?: string; last_name?: string }>)
    .map((row) => {
      const fullName = `${String(row.first_name ?? "")} ${String(row.last_name ?? "")}`.trim()
      const count = activeCounts.get(String(row.id)) ?? 0

      return {
        id: String(row.id),
        label:
          count > 0
            ? `${fullName} - ${count} dispositivo(s) activo(s)`
            : `${fullName} - sin dispositivos activos`
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label, "es"))
}

export default async function SettingsPage() {
  const { profile } = await requireAuthenticatedProfile()

  if (!profile) {
    return <BlockedState />
  }

  const isAdmin = profile.role === "admin"
  const [manualPushClients, staffProfiles, businessSettings, clients] = await Promise.all([
    getManualPushClients(),
    isAdmin ? getStaffProfiles() : Promise.resolve([]),
    isAdmin ? getBusinessSettings() : Promise.resolve(null),
    isAdmin ? getClients() : Promise.resolve([])
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajustes"
        description="Preferencias del perfil, configuracion basica del negocio y gestion interna."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <InstallPwaCard />

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Color de agenda</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileColorForm profile={profile} />
          </CardContent>
        </Card>

        <ManualPushCard clients={manualPushClients} />

        {isAdmin ? (
          <>
            {businessSettings ? <BusinessSettingsCard settings={businessSettings} /> : null}

            <DailyExpiryScanForm />

            <ManualClientPortalActivationCard clients={clients} />

            <StaffManagementCard staffProfiles={staffProfiles} />
          </>
        ) : null}
      </div>
    </div>
  )
}
