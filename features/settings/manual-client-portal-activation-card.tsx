"use client"

import { useActionState, useEffect } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { manuallyActivateClientPortalAction } from "@/features/settings/actions"
import { nativeSelectClassName } from "@/lib/utils"
import type { Client } from "@/types/domain"

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      {pending ? "Activando..." : "Activar acceso manual"}
    </Button>
  )
}

export function ManualClientPortalActivationCard({
  clients
}: {
  clients: Client[]
}) {
  const [state, action] = useActionState(manuallyActivateClientPortalAction, {})
  const eligibleClients = clients
    .filter((client) => client.email && client.isActive)
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "es"))

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
    <Card className="rounded-3xl xl:col-span-2">
      <CardHeader>
        <CardTitle>Activacion manual de portal cliente</CardTitle>
        <CardDescription>
          Crea o repara el acceso de un cliente sin enviar codigo por email. Solo se guarda el hash de la contrasena.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium">Cliente</label>
            <select name="clientId" className={nativeSelectClassName} required defaultValue="">
              <option value="" disabled>Selecciona un cliente</option>
              {eligibleClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName} - {client.email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Contrasena</label>
            <Input name="password" type="password" minLength={8} maxLength={128} required autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Repetir contrasena</label>
            <Input name="confirmPassword" type="password" minLength={8} maxLength={128} required autoComplete="new-password" />
          </div>
          <div className="lg:self-end">
            <SubmitButton />
          </div>
        </form>
        {eligibleClients.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No hay clientes activos con email disponible para activar manualmente.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
