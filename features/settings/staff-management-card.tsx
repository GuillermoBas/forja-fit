"use client"

import { useActionState, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import {
  resendStaffActivationAction,
  upsertStaffUserAction
} from "@/features/settings/actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { nativeSelectClassName } from "@/lib/utils"
import type { StaffProfileSummary } from "@/types/domain"

function InlineSubmit({
  idleLabel,
  pendingLabel
}: {
  idleLabel: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? pendingLabel : idleLabel}
    </Button>
  )
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
  profile: StaffProfileSummary
}) {
  const [updateState, updateAction] = useActionState(upsertStaffUserAction, {})
  const [resendState, resendAction] = useActionState(resendStaffActivationAction, {})
  const [fullName, setFullName] = useState(profile.fullName)
  const [role, setRole] = useState(profile.role)
  const [isActive, setIsActive] = useState(profile.isActive)

  useEffect(() => {
    setFullName(profile.fullName)
    setRole(profile.role)
    setIsActive(profile.isActive)
  }, [profile.fullName, profile.role, profile.isActive])

  return (
    <div className="space-y-4 rounded-2xl border p-4">
      <ActionToast error={updateState.error} success={updateState.success} />
      <ActionToast error={resendState.error} success={resendState.success} />
      <form action={updateAction} className="grid gap-4 lg:grid-cols-[2fr_2fr_1fr_auto_auto]">
        <input type="hidden" name="profileId" value={profile.id} />
        <div className="space-y-2">
          <label className="text-sm font-medium">Nombre</label>
          <Input name="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <Input value={profile.email} disabled className="cursor-not-allowed bg-slate-100 text-slate-500" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Rol</label>
          <select
            name="role"
            className={nativeSelectClassName}
            value={role}
            onChange={(event) => setRole(event.target.value as StaffProfileSummary["role"])}
          >
            <option value="trainer">Entrenador</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm lg:self-end lg:pb-3">
          <input
            type="checkbox"
            name="isActive"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Activo
        </label>
        <div className="lg:self-end">
          <AuthFormSubmit idleLabel="Guardar" pendingLabel="Guardando..." />
        </div>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-alt/60 px-3 py-2 text-sm">
        <span className={profile.emailVerified ? "text-text-secondary" : "font-medium text-amber-700"}>
          {profile.emailVerified ? "Acceso activado" : "Pendiente de activacion por codigo"}
        </span>
        {!profile.emailVerified ? (
          <form action={resendAction}>
            <input type="hidden" name="profileId" value={profile.id} />
            <InlineSubmit idleLabel="Reenviar codigo" pendingLabel="Reenviando..." />
          </form>
        ) : null}
      </div>
    </div>
  )
}

export function StaffManagementCard({
  staffProfiles
}: {
  staffProfiles: StaffProfileSummary[]
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
              Puedes cambiar nombre, rol o activar y desactivar accesos. Si un codigo ha caducado, tambien puedes reenviarlo.
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
