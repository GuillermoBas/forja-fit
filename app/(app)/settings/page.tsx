import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BlockedState } from "@/components/blocked-state"
import { PageHeader } from "@/components/page-header"
import { InstallForjaFit } from "@/components/pwa/install-forjafit"
import { ManualPushCard } from "@/features/settings/manual-push-card"
import { ProfileColorForm } from "@/features/settings/profile-color-form"
import { getAuthCookies } from "@/lib/auth/cookies"
import { requireAuthenticatedProfile } from "@/lib/auth/session"
import { appConfig } from "@/lib/config"
import { createServerInsforgeClient } from "@/lib/insforge/server"

type ManualPushClientRow = {
  id: string
  label: string
}

async function getManualPushClients(): Promise<ManualPushClientRow[]> {
  const { accessToken } = await getAuthCookies()

  if (!accessToken) {
    return []
  }

  const client = createServerInsforgeClient({ accessToken }) as any
  const portalAccountsResult = await client.database
    .from("client_portal_accounts")
    .select("id,client_id,status")
    .eq("status", "claimed")

  if (portalAccountsResult.error || !portalAccountsResult.data?.length) {
    return []
  }

  const portalAccounts = portalAccountsResult.data as Array<{ id: string; client_id: string }>
  const clientIds = portalAccounts.map((row) => row.client_id)
  const portalAccountIds = portalAccounts.map((row) => row.id)

  const [clientsResult, subscriptionsResult] = await Promise.all([
    client.database.from("clients").select("id,first_name,last_name").in("id", clientIds),
    client.database
      .from("push_subscriptions")
      .select("client_portal_account_id,is_active")
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
  const manualPushClients = await getManualPushClients()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajustes"
        description="Preferencias del perfil, configuracion basica del negocio y gestion interna."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Instalacion PWA</CardTitle>
          </CardHeader>
          <CardContent>
            <InstallForjaFit respectDismissal={false} compact surface="plain" />
          </CardContent>
        </Card>

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
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle>Negocio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p><span className="font-medium">Nombre:</span> {appConfig.businessName}</p>
                <p><span className="font-medium">Zona horaria:</span> {appConfig.timezone}</p>
                <p><span className="font-medium">Aviso por defecto:</span> 7 dias</p>
                <p><span className="font-medium">IVA por defecto:</span> configurable en UI futura</p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle>Operaciones protegidas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Crear o promocionar admins, anadir stock, anular ventas y editar precios debe pasar siempre por funciones protegidas.
                </p>
                <p>
                  Si InsForge Schedules no esta disponible, desde aqui puede exponerse la ejecucion manual segura de `run_daily_expiry_scan`.
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  )
}
