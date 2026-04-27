"use client"

import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import {
  createInternalNotificationAction,
  runDailyExpiryScanAction
} from "@/features/notifications/actions"
import type { Client } from "@/types/domain"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { nativeSelectClassName } from "@/lib/utils"

function ErrorToast({ message }: { message?: string }) {
  useEffect(() => {
    if (message) {
      toast.error(message)
    }
  }, [message])

  return null
}

export function InternalNotificationForm({
  clients
}: {
  clients: Client[]
}) {
  const [state, formAction] = useActionState(createInternalNotificationAction, {})

  return (
    <Card className="rounded-3xl">
      <ErrorToast message={state.error} />
      <CardHeader>
        <CardTitle>Nota interna</CardTitle>
        <CardDescription>Apunta recordatorios internos o incidencias rápidas del día.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <div className="field-shell">
            <label className="field-label">Cliente</label>
            <select name="clientId" className={nativeSelectClassName}>
              <option value="">Sin cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="field-shell">
            <label className="field-label">Asunto</label>
            <Input name="subject" required />
          </div>
          <div className="field-shell md:col-span-2">
            <label className="field-label">Mensaje</label>
            <textarea
              name="body"
              required
              className="min-h-28 w-full"
            />
          </div>
          <div className="md:col-span-2">
            <AuthFormSubmit idleLabel="Crear nota interna" pendingLabel="Guardando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function DailyExpiryScanForm() {
  const [state, formAction] = useActionState(runDailyExpiryScanAction, {})

  return (
    <Card className="rounded-3xl">
      <ErrorToast message={state.error} />
      <CardHeader>
        <CardTitle>Escaneo diario de caducidades</CardTitle>
        <CardDescription>Fallback manual hasta tener schedules estables. El job es idempotente por fecha.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <div className="field-shell">
            <label className="field-label">Fecha de ejecución</label>
            <Input name="runOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div className="md:col-span-2">
            <AuthFormSubmit idleLabel="Ejecutar escaneo" pendingLabel="Procesando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
