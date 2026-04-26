"use client"

import { useEffect } from "react"
import { useFormState, useFormStatus } from "react-dom"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import {
  clearPortalNutritionChatAction,
  clearPortalNutritionMemoryAction,
  deletePortalWeeklyPlansAction,
  updatePortalPhoneAction,
  type PortalSettingsState
} from "@/features/client-portal/settings-actions"
import type { Client } from "@/types/domain"

const initialState: PortalSettingsState = {}

function AdvancedSubmitButton({
  idleLabel,
  pendingLabel
}: {
  idleLabel: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant="outline"
      className="h-11 w-full rounded-2xl px-4 py-2.5 whitespace-nowrap sm:w-auto sm:min-w-[8rem] sm:shrink-0 sm:px-5"
      disabled={pending}
    >
      {pending ? pendingLabel : idleLabel}
    </Button>
  )
}

function AdvancedActionForm({
  title,
  description,
  confirmMessage,
  idleLabel,
  pendingLabel,
  action
}: {
  title: string
  description: string
  confirmMessage: string
  idleLabel: string
  pendingLabel: string
  action: (prevState: PortalSettingsState) => Promise<PortalSettingsState>
}) {
  const [state, formAction] = useFormState(action, initialState)

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  useEffect(() => {
    if (state.success) {
      toast.success(state.success)
    }
  }, [state.success])

  return (
    <form
      action={formAction}
      className="w-full max-w-full rounded-2xl border border-border/70 bg-surface-alt/40 p-4"
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault()
        }
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        </div>
        <AdvancedSubmitButton idleLabel={idleLabel} pendingLabel={pendingLabel} />
      </div>
    </form>
  )
}

export function PortalSettingsForm({
  client,
  savedPlanCount
}: {
  client: Client
  savedPlanCount: number
}) {
  const [state, formAction] = useFormState(updatePortalPhoneAction, initialState)

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  useEffect(() => {
    if (state.success) {
      toast.success(state.success)
    }
  }, [state.success])

  return (
    <div className="space-y-5">
      <Card className="panel-hover">
        <CardHeader>
          <CardTitle>Datos de contacto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre</label>
              <Input
                value={client.fullName}
                readOnly
                disabled
                className="cursor-not-allowed border-border/80 bg-surface-alt text-text-muted shadow-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                value={client.email ?? ""}
                readOnly
                disabled
                className="cursor-not-allowed border-border/80 bg-surface-alt text-text-muted shadow-none"
              />
            </div>
          </div>

          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Telefono</label>
              <Input
                name="phone"
                defaultValue={client.phone ?? ""}
                placeholder="600123123"
                autoComplete="tel"
              />
            </div>
            <AuthFormSubmit idleLabel="Guardar telefono" pendingLabel="Guardando..." />
          </form>
        </CardContent>
      </Card>

      <Card className="panel-hover">
        <CardHeader>
          <CardTitle>Acciones avanzadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdvancedActionForm
            title="Borrar historial del chat nutricional"
            description="Elimina mensajes, uso registrado y resumen acumulado del asistente."
            confirmMessage="Vas a borrar todo el historial del chat nutricional. Esta accion no se puede deshacer. ¿Quieres continuar?"
            idleLabel="Borrar chat"
            pendingLabel="Borrando..."
            action={clearPortalNutritionChatAction}
          />
          <AdvancedActionForm
            title="Borrar memoria nutricional permanente"
            description="Limpia altura, peso, objetivo, preferencias, restricciones y rolling summary."
            confirmMessage="Vas a borrar la memoria nutricional permanente. Esta accion no se puede deshacer. ¿Quieres continuar?"
            idleLabel="Borrar memoria"
            pendingLabel="Borrando..."
            action={clearPortalNutritionMemoryAction}
          />
          <AdvancedActionForm
            title="Eliminar menus semanales guardados"
            description={`Actualmente hay ${savedPlanCount} menu(s) semanal(es) guardado(s).`}
            confirmMessage="Vas a eliminar todos los menus semanales guardados. Esta accion no se puede deshacer. ¿Quieres continuar?"
            idleLabel="Eliminar menus"
            pendingLabel="Eliminando..."
            action={deletePortalWeeklyPlansAction}
          />
        </CardContent>
      </Card>
    </div>
  )
}
