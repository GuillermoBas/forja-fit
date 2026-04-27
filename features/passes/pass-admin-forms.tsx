"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { Client, Pass, PassType } from "@/types/domain"
import { deletePassAction, type PassActionState, updatePassAction, upsertPassTypeAction } from "@/features/passes/actions"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

function usePassFeedback(state: PassActionState, successMessage: string) {
  const router = useRouter()

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  useEffect(() => {
    if (!state.success) {
      return
    }

    toast.success(successMessage)

    if (state.redirectTo) {
      router.push(state.redirectTo)
      return
    }

    router.refresh()
  }, [router, state.redirectTo, state.success, successMessage])
}

function HolderFields({
  clients,
  defaultHolderIds,
  isSharedAllowed
}: {
  clients: Client[]
  defaultHolderIds: string[]
  isSharedAllowed: boolean
}) {
  const visibleSlots = isSharedAllowed ? 5 : 1

  return (
    <>
      {Array.from({ length: visibleSlots }, (_, index) => {
        const value = defaultHolderIds[index] ?? ""
        return (
          <div key={index} className="space-y-2">
            <label className="text-sm font-medium">
              {index === 0 ? "Titular principal" : `Titular ${index + 1} (opcional)`}
            </label>
            <select
              name="holderClientIds"
              defaultValue={value}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="">{index === 0 ? "Selecciona un cliente" : "Sin asignar"}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </>
  )
}

export function PassTypeForm({
  passTypes,
  selectedPassTypeId
}: {
  passTypes: PassType[]
  selectedPassTypeId?: string
}) {
  const selectedPassType = useMemo(
    () => passTypes.find((item) => item.id === selectedPassTypeId) ?? null,
    [passTypes, selectedPassTypeId]
  )
  const [kind, setKind] = useState<PassType["kind"]>(selectedPassType?.kind ?? "session")
  const [state, formAction] = useActionState(upsertPassTypeAction, {})

  useEffect(() => {
    setKind(selectedPassType?.kind ?? "session")
  }, [selectedPassType?.kind])

  usePassFeedback(
    state,
    selectedPassType ? "Tipo de bono actualizado correctamente." : "Tipo de bono creado correctamente."
  )

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle>{selectedPassType ? "Editar tipo de bono" : "Nuevo tipo de bono"}</CardTitle>
        <CardDescription>
          Configura bonos por sesiones de 1 a 30 o un bono mensual por mes natural.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value={selectedPassType?.id ?? ""} />
          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre</label>
            <Input name="name" defaultValue={selectedPassType?.name ?? ""} placeholder="Bono 6 sesiones" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo</label>
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as PassType["kind"])}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            >
              <option value="session">Por sesiones</option>
              <option value="monthly">Mensual</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Sesiones</label>
            <Input
              name="sessionsTotal"
              type="number"
              min={1}
              max={30}
              disabled={kind === "monthly"}
              defaultValue={selectedPassType?.sessionCount ?? ""}
              placeholder={kind === "monthly" ? "No aplica" : "Entre 1 y 30"}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Precio bruto</label>
            <Input name="priceGross" type="number" step="0.01" min={0} defaultValue={selectedPassType?.price ?? 0} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">IVA</label>
            <Input name="vatRate" type="number" step="0.01" min={0} defaultValue={selectedPassType?.vatRate ?? 21} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Orden</label>
            <Input name="sortOrder" type="number" min={0} defaultValue={selectedPassType?.sortOrder ?? 0} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="sharedAllowed" defaultChecked={selectedPassType?.sharedAllowed ?? true} />
            Permitir bono compartido (hasta 5 titulares)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={selectedPassType?.isActive ?? true} />
            Tipo activo
          </label>
          <div className="md:col-span-2">
            <AuthFormSubmit
              idleLabel={selectedPassType ? "Guardar tipo de bono" : "Crear tipo de bono"}
              pendingLabel="Guardando..."
            />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function PassEditorForm({
  pass,
  passTypes,
  clients
}: {
  pass: Pass
  passTypes: PassType[]
  clients: Client[]
}) {
  const [state, formAction] = useActionState(updatePassAction, {})
  const [deleteState, deleteFormAction] = useActionState(deletePassAction, {})
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedPassTypeId, setSelectedPassTypeId] = useState(pass.passTypeId)
  const selectedPassType = useMemo(
    () => passTypes.find((item) => item.id === selectedPassTypeId) ?? null,
    [passTypes, selectedPassTypeId]
  )
  const maxSessions = selectedPassType?.sessionCount ?? pass.originalSessions ?? 30

  usePassFeedback(state, "Bono actualizado correctamente.")
  usePassFeedback(deleteState, "Bono borrado correctamente.")

  return (
    <>
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Editar bono</CardTitle>
          <CardDescription>
            Ajusta titulares, tipo, saldo y fechas. El borrado queda bloqueado si el bono ya tiene movimientos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="passId" value={pass.id} />
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de bono</label>
              <select
                name="passTypeId"
                value={selectedPassTypeId}
                onChange={(event) => setSelectedPassTypeId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                {passTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Contratado el</label>
              <Input name="contractedOn" type="date" defaultValue={pass.contractedOn} />
            </div>
            <HolderFields
              clients={clients}
              defaultHolderIds={pass.holderClientIds}
              isSharedAllowed={selectedPassType?.sharedAllowed ?? true}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Pagado por</label>
              <select
                name="purchasedByClientId"
                defaultValue={pass.purchasedByClientId ?? pass.holderClientIds[0] ?? ""}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <select
                name="status"
                defaultValue={pass.status}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="active">Activo</option>
                <option value="paused">Pausado</option>
                {selectedPassType?.kind === "session" ? (
                  <option value="out_of_sessions">Sin sesiones</option>
                ) : null}
                <option value="expired">Caducado</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
            {selectedPassType?.kind === "session" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Sesiones restantes</label>
                <Input
                  name="sessionsLeft"
                  type="number"
                  min={0}
                  max={maxSessions}
                  defaultValue={pass.sessionsLeft ?? maxSessions}
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                Este bono es mensual. No consume sesiones y caduca al final del mes natural contratado.
              </div>
            )}
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Notas</label>
              <textarea
                name="notes"
                defaultValue={pass.notes ?? ""}
                className="min-h-28 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <AuthFormSubmit idleLabel="Guardar bono" pendingLabel="Guardando..." />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Zona peligrosa</CardTitle>
          <CardDescription>
            Solo se puede borrar un bono limpio, sin consumos, pausas, ventas, renovaciones, notificaciones ni sesiones vinculadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" type="button" onClick={() => setIsDeleteOpen(true)}>
            Borrar bono
          </Button>
        </CardContent>
      </Card>

      {isDeleteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl">
            <div className="space-y-3">
              <h3 className="text-xl font-semibold text-destructive">Confirmar borrado del bono</h3>
              <p className="text-sm text-muted-foreground">
                Esta accion solo es recomendable para pruebas o altas erróneas. Para continuar, escribe
                <span className="font-semibold text-foreground"> CONFIRMO</span>.
              </p>
              <form action={deleteFormAction} className="space-y-4">
                <input type="hidden" name="passId" value={pass.id} />
                <div className="space-y-2">
                  <label className="text-sm font-medium">Texto de confirmacion</label>
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
  )
}
