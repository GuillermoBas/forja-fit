"use client"

import { useEffect } from "react"
import { useFormState } from "react-dom"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import {
  sendManualPushAction,
  type ManualPushActionState,
  type ManualPushClientOption
} from "@/features/settings/actions"

const initialState: ManualPushActionState = {}

function FormToast({ error, success }: { error?: string; success?: string }) {
  useEffect(() => {
    if (error) {
      toast.error(error)
    }

    if (success) {
      toast.success(success)
    }
  }, [error, success])

  return null
}

export function ManualPushCard({
  clients
}: {
  clients: ManualPushClientOption[]
}) {
  const [state, formAction] = useFormState(sendManualPushAction, initialState)

  return (
    <Card className="rounded-3xl xl:col-span-2">
      <CardHeader>
        <CardTitle>Push manual a clientes</CardTitle>
        <CardDescription>
          Sirve para probar notificaciones push o enviar un aviso personalizado a un cliente del portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <FormToast error={state.error} success={state.success} />

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <label className="space-y-2">
              <span className="text-sm font-medium text-text-primary">Cliente</span>
              <select
                name="clientId"
                defaultValue=""
                className="flex h-12 w-full rounded-xl border border-input bg-surface px-4 text-sm text-text-primary shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-all duration-200 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15"
                required
              >
                <option value="" disabled>
                  Selecciona un cliente del portal
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-text-primary">Ruta de destino</span>
              <Input name="url" defaultValue="/cliente/dashboard" placeholder="/cliente/actividad" required />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.8fr]">
            <label className="space-y-2">
              <span className="text-sm font-medium text-text-primary">Titulo</span>
              <Input name="title" defaultValue="Mensaje de ForjaFit" maxLength={80} required />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-text-primary">Mensaje</span>
              <textarea
                name="body"
                rows={4}
                maxLength={240}
                placeholder="Escribe el texto que quieres enviar al cliente."
                className="w-full rounded-xl border border-input bg-surface px-4 py-3 text-sm text-text-primary shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-all duration-200 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15"
                required
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/80 bg-surface-alt/45 px-4 py-3 text-sm text-text-secondary">
            <p>
              Solo aparecen clientes con acceso al portal reclamado. Si no tienen dispositivos activos,
              la prueba se registrara como omitida.
            </p>
            <AuthFormSubmit idleLabel="Enviar push" pendingLabel="Enviando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
