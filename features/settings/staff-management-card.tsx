"use client"

import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { upsertStaffUserAction } from "@/features/settings/actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { nativeSelectClassName } from "@/lib/utils"

type StaffProfileRow = {
  id: string
  fullName: string
  email: string
  role: "admin" | "trainer"
  isActive: boolean
}

function ActionToast({
  error,
  success
}: {
  error?: string
  success?: string
}) {
  useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  useEffect(() => {
    if (success) {
      toast.success(success)
    }
  }, [success])

  return null
}

function StaffRowForm({
  profile
}: {
  profile: StaffProfileRow
}) {
  const [state, formAction] = useActionState(upsertStaffUserAction, {})

  return (
    <form action={formAction} className="grid gap-4 rounded-2xl border p-4 lg:grid-cols-[2fr_2fr_1fr_auto_auto]">
      <ActionToast error={state.error} success={state.success} />
      <input type="hidden" name="profileId" value={profile.id} />
      <div className="space-y-2">
        <label className="text-sm font-medium">Nombre</label>
        <Input name="fullName" defaultValue={profile.fullName} required />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Email</label>
        <Input value={profile.email} disabled readOnly />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Rol</label>
        <select name="role" className={nativeSelectClassName} defaultValue={profile.role}>
          <option value="trainer">Entrenador</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm lg:self-end lg:pb-3">
        <input type="checkbox" name="isActive" defaultChecked={profile.isActive} />
        Activo
      </label>
      <div className="lg:self-end">
        <AuthFormSubmit idleLabel="Guardar" pendingLabel="Guardando..." />
      </div>
    </form>
  )
}

export function StaffManagementCard({
  staffProfiles
}: {
  staffProfiles: StaffProfileRow[]
}) {
  const [createState, createAction] = useActionState(upsertStaffUserAction, {})

  return (
    <Card className="rounded-3xl xl:col-span-2">
      <ActionToast error={createState.error} success={createState.success} />
      <CardHeader>
        <CardTitle>Staff y accesos</CardTitle>
        <CardDescription>
          Alta de entrenadores o admins y mantenimiento del staff actual desde una Function protegida.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form action={createAction} className="grid gap-4 rounded-2xl border p-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre completo</label>
            <Input name="fullName" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Clave temporal</label>
            <Input name="password" type="password" minLength={6} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rol inicial</label>
            <select name="role" className={nativeSelectClassName} defaultValue="trainer">
              <option value="trainer">Entrenador</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm lg:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked />
            Usuario activo desde el alta
          </label>
          <div className="lg:col-span-2">
            <AuthFormSubmit idleLabel="Crear usuario staff" pendingLabel="Creando..." />
          </div>
        </form>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Equipo actual</h3>
            <p className="text-sm text-muted-foreground">
              Puedes cambiar nombre, rol o activar y desactivar accesos sin tocar la base de datos.
            </p>
          </div>
          {staffProfiles.length ? (
            <div className="space-y-3">
              {staffProfiles.map((profile) => (
                <StaffRowForm key={profile.id} profile={profile} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              No hay perfiles staff cargados en este entorno.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
