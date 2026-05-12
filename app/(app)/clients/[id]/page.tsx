import Link from "next/link"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getClientById,
  getClients,
  getClientHistory,
  getNotifications,
  getClientPortalAccountByClientId,
  getClientPortalSupportState,
  getPassTypes,
  getPasses,
  getSales,
  getClientMaxWeightEntries,
  getStrengthMetrics,
  getTrainerProfiles
} from "@/lib/data"
import { getCurrentProfile } from "@/lib/auth/session"
import { isAdmin } from "@/lib/permissions/roles"
import { formatCurrency, formatDate, formatPassStatus } from "@/lib/utils"
import {
  ConsumeSessionForm,
  CreatePassForm,
  PausePassForm,
  RenewPassForm,
  ScheduleExistingPassForm
} from "@/features/clients/pass-operation-forms"
import { Button } from "@/components/ui/button"
import { ClientPortalAdminForm } from "@/features/clients/client-portal-admin-form"
import { ClientMaxWeightsCard } from "@/features/clients/client-max-weights-card"

export default async function ClientDetailPage({
  params
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const { id } = await Promise.resolve(params)
  const client = await getClientById(id)

  if (!client) {
    notFound()
  }

  const [
    allClients,
    allPasses,
    notifications,
    sales,
    passTypes,
    history,
    profile,
    portalAccount,
    portalSupport,
    strengthMetrics,
    maxWeightEntries,
    allTrainerProfiles
  ] = await Promise.all([
    getClients(),
    getPasses(),
    getNotifications(),
    getSales(),
    getPassTypes({ includeInactive: true }),
    getClientHistory(id),
    getCurrentProfile(),
    getClientPortalAccountByClientId(id),
    getClientPortalSupportState(id),
    getStrengthMetrics({ includeInactive: true }),
    getClientMaxWeightEntries(id),
    getTrainerProfiles()
  ])

  const passes = allPasses.filter((item) => item.holderClientIds.includes(client.id))
  const activePassTypes = passTypes.filter((item) => item.isActive)
  const clientNotifications = notifications.filter((item) => item.clientName === client.fullName)
  const clientSales = sales.filter((item) => item.clientName === client.fullName)
  const canManagePasses = isAdmin(profile?.role)
  const trainerProfiles = profile?.role === "admin"
    ? allTrainerProfiles
    : allTrainerProfiles.filter((trainer) => trainer.id === profile?.id)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title={client.fullName}
          description="Ficha del cliente, bonos, historial operativo, avisos y ventas."
        />
        <Button asChild variant="outline">
          <Link href={`/clients/${client.id}/edit`}>Editar cliente</Link>
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Datos del cliente</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium break-words">{client.email ?? "Sin email"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Teléfono</p>
              <p className="font-medium break-words">{client.phone ?? "Sin teléfono"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Notas</p>
              <p className="font-medium break-words">{client.notes ?? "Sin notas"}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Estado del portal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Estado del portal</p>
                <p className="font-medium">
                  {portalAccount ? (portalAccount.status === "claimed" ? "Reclamado" : "Desactivado") : "Sin activar"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Proveedor principal</p>
                <p className="font-medium">
                  {portalAccount ? (portalAccount.primaryProvider === "google" ? "Google" : "Email y clave") : "Sin proveedor"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Reclamado el</p>
                <p className="font-medium">
                  {portalAccount?.claimedAt ? formatDate(portalAccount.claimedAt) : "Sin reclamar"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Último acceso</p>
                <p className="font-medium">
                  {portalAccount?.lastLoginAt ? formatDate(portalAccount.lastLoginAt) : "Sin accesos"}
                </p>
              </div>
            </div>

            {isAdmin(profile?.role) ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
                <div>
                  <p className="font-medium">Soporte de portal</p>
                  <p className="text-sm text-muted-foreground">
                    Puedes desvincular la cuenta del portal para forzar un nuevo claim del cliente sin tocar sus datos operativos.
                  </p>
                  {portalSupport ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          portalSupport.readiness === "claimed"
                            ? "success"
                            : portalSupport.readiness === "disabled"
                              ? "warning"
                              : portalSupport.readiness === "ready_to_claim"
                                ? "default"
                                : "danger"
                        }
                      >
                        {portalSupport.readiness === "claimed"
                          ? "Portal activo"
                          : portalSupport.readiness === "disabled"
                            ? "Portal desactivado"
                            : portalSupport.readiness === "ready_to_claim"
                              ? "Listo para registro"
                              : portalSupport.readiness === "duplicate_email"
                                ? "Email duplicado"
                                : "Falta email"}
                      </Badge>
                      <p className="text-sm text-muted-foreground">{portalSupport.message}</p>
                    </div>
                  ) : null}
                </div>
                <ClientPortalAdminForm clientId={client.id} portalStatus={portalAccount?.status ?? null} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="passes">
        <TabsList>
          <TabsTrigger value="passes">Bonos</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          <TabsTrigger value="sales">Ventas</TabsTrigger>
        </TabsList>

        <TabsContent value="passes">
          <Card className="rounded-3xl">
            <CardContent className="space-y-3 p-6">
              {passes.length ? passes.map((item) => (
                <div key={item.id} className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{item.passTypeName}</p>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          item.status === "expired"
                            ? "danger"
                            : item.status === "paused" || item.status === "out_of_sessions"
                              ? "warning"
                              : "success"
                        }
                      >
                        {formatPassStatus(item.status)}
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        {item.status === "expired"
                          ? `Caducado el ${formatDate(item.expiresOn)}`
                          : `Caduca ${formatDate(item.expiresOn)}`}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Titulares: {item.holderNames.join(" / ")}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.passKind === "monthly"
                      ? "Bono mensual por mes natural"
                      : `Sesiones restantes: ${item.sessionsLeft ?? 0}`}
                  </p>
                  {canManagePasses ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/passes/${item.id}/edit`}>Editar bono</Link>
                      </Button>
                      <ScheduleExistingPassForm
                        clientId={client.id}
                        pass={item}
                        trainerProfiles={trainerProfiles}
                      />
                    </div>
                  ) : null}
                </div>
              )) : <p className="text-sm text-muted-foreground">Todavía no hay bonos para este cliente.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="rounded-3xl">
            <CardContent className="space-y-3 p-6">
              {history.length ? history.map((item) => (
                <div key={item.id} className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(item.happenedAt)}</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
                </div>
              )) : <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card className="rounded-3xl">
            <CardContent className="space-y-3 p-6">
              {clientNotifications.length ? clientNotifications.map((item) => (
                <div key={item.id} className="rounded-2xl border p-4">
                  <p className="font-medium">{item.message}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(item.createdAt)}</p>
                </div>
              )) : <p className="text-sm text-muted-foreground">Sin notificaciones para este cliente.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card className="rounded-3xl">
            <CardContent className="space-y-3 p-6">
              {clientSales.length ? clientSales.map((item) => (
                <div key={item.id} className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Factura #{item.invoiceNumber}</p>
                    <p>{formatCurrency(item.totalAmount)}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{formatDate(item.soldAt)}</p>
                </div>
              )) : <p className="text-sm text-muted-foreground">Sin ventas registradas.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ClientMaxWeightsCard
        clientId={client.id}
        metrics={strengthMetrics}
        entries={maxWeightEntries}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <ConsumeSessionForm clientId={client.id} passes={passes} />
        <RenewPassForm
          clientId={client.id}
          passes={passes}
          passTypes={passTypes}
          trainerProfiles={trainerProfiles}
        />
        <CreatePassForm
          clientId={client.id}
          clients={allClients}
          passTypes={activePassTypes}
          trainerProfiles={trainerProfiles}
        />
        <PausePassForm clientId={client.id} passes={passes} />
      </div>
    </div>
  )
}
