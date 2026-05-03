"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { Client, ClientPortalSupportState } from "@/types/domain"
import { deleteClientAction, upsertClientAction } from "@/features/clients/actions"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ClientPortalAdminForm } from "@/features/clients/client-portal-admin-form"

export function ClientForm({
  client,
  canDelete = false,
  portalSupport
}: {
  client?: Client | null
  canDelete?: boolean
  portalSupport?: ClientPortalSupportState | null
}) {
  const [state, formAction] = useActionState(upsertClientAction, {})
  const [deleteState, deleteFormAction] = useActionState(deleteClientAction, {})
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (state?.error) {
      toast.error(state.error)
    }
  }, [state?.error])

  useEffect(() => {
    if (!state?.success) {
      return
    }

    toast.success(client ? "Cliente actualizado correctamente." : "Cliente creado correctamente.")

    if (state.redirectTo) {
      router.push(state.redirectTo)
      return
    }

    router.refresh()
  }, [client, router, state?.redirectTo, state?.success])

  useEffect(() => {
    if (deleteState?.error) {
      toast.error(deleteState.error)
    }
  }, [deleteState?.error])

  useEffect(() => {
    if (!deleteState?.success) {
      return
    }

    toast.success("Cliente borrado correctamente.")
    setIsDeleteOpen(false)

    if (deleteState.redirectTo) {
      router.push(deleteState.redirectTo)
      return
    }

    router.refresh()
  }, [deleteState?.redirectTo, deleteState?.success, router])

  const parts = client?.fullName.split(" ") ?? []
  const firstName = parts.slice(0, 1).join(" ")
  const lastName = parts.slice(1).join(" ")
  const fieldErrors = state?.fieldErrors ?? {}

  return (
    <>
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>{client ? "Editar cliente" : "Nuevo cliente"}</CardTitle>
          <CardDescription>Solo el nombre es obligatorio. El resto de datos son opcionales.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="id" defaultValue={client?.id ?? ""} />
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre</label>
              <Input
                name="firstName"
                defaultValue={firstName}
                aria-invalid={Boolean(fieldErrors.firstName)}
              />
              {fieldErrors.firstName ? (
                <p className="text-sm text-destructive">{fieldErrors.firstName}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Apellidos (opcional)</label>
              <Input
                name="lastName"
                defaultValue={lastName}
                placeholder="Opcional"
                aria-invalid={Boolean(fieldErrors.lastName)}
              />
              {fieldErrors.lastName ? (
                <p className="text-sm text-destructive">{fieldErrors.lastName}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                name="email"
                type="email"
                defaultValue={client?.email ?? ""}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email ? (
                <p className="text-sm text-destructive">{fieldErrors.email}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Teléfono</label>
              <Input name="phone" defaultValue={client?.phone ?? ""} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">NIF</label>
              <Input name="taxId" defaultValue={client?.taxId ?? ""} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Notas</label>
              <textarea
                name="notes"
                defaultValue={client?.notes ?? ""}
                className="min-h-28 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" name="isActive" defaultChecked={client?.isActive ?? true} />
              Cliente activo
            </label>
            <div className="md:col-span-2">
              <AuthFormSubmit
                idleLabel={client ? "Guardar cambios" : "Crear cliente"}
                pendingLabel="Guardando..."
              />
            </div>
          </form>
        </CardContent>
      </Card>

      {client && portalSupport ? (
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Portal del cliente</CardTitle>
            <CardDescription>
              Estado de preparación del portal y acciones de soporte para admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
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

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Email de portal</p>
                <p className="font-medium">{portalSupport.email ?? "Sin email"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Coincidencias exactas</p>
                <p className="font-medium">{portalSupport.emailMatchCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Proveedor</p>
                <p className="font-medium">
                  {portalSupport.portalAccount
                    ? portalSupport.portalAccount.primaryProvider === "google"
                      ? "Google"
                      : "Email y clave"
                    : "Pendiente de activación"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Último acceso</p>
                <p className="font-medium">
                  {portalSupport.portalAccount?.lastLoginAt ?? "Sin accesos"}
                </p>
              </div>
            </div>

            <ClientPortalAdminForm
              clientId={client.id}
              portalStatus={portalSupport.portalAccount?.status ?? null}
            />
          </CardContent>
        </Card>
      ) : null}

      {client && canDelete ? (
        <>
          <Card className="rounded-3xl border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Zona peligrosa</CardTitle>
              <CardDescription>
                Solo admin. El borrado solo se permite si el cliente no tiene bonos, ventas,
                notificaciones ni sesiones de agenda asociadas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" type="button" onClick={() => setIsDeleteOpen(true)}>
                Borrar cliente
              </Button>
            </CardContent>
          </Card>

          {isDeleteOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
              <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl">
                <div className="space-y-3">
                  <h3 className="text-xl font-semibold text-destructive">Confirmar borrado</h3>
                  <p className="text-sm text-muted-foreground">
                    Esta acción eliminará el cliente de forma permanente. Para continuar, escribe
                    <span className="font-semibold text-foreground"> CONFIRMO</span>.
                  </p>
                  <form action={deleteFormAction} className="space-y-4">
                    <input type="hidden" name="clientId" value={client.id} />
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Texto de confirmación</label>
                      <Input name="confirmationText" autoFocus placeholder="CONFIRMO" />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setIsDeleteOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button variant="destructive" className="flex-1">
                        Confirmar borrado
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  )
}
