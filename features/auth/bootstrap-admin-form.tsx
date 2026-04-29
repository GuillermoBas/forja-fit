"use client"

import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { bootstrapFirstAdminAction } from "@/features/auth/actions"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { StaffAuthShell } from "@/features/auth/staff-auth-shell"

export function BootstrapAdminForm() {
  const [state, formAction] = useActionState(bootstrapFirstAdminAction, {})

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  return (
    <StaffAuthShell
      title="Crear admin inicial"
      description="Este registro solo debe estar abierto mientras no exista ningun administrador."
    >
      <form action={formAction} className="space-y-4">
        <div className="field-shell">
          <label className="field-label">Nombre completo</label>
          <Input name="fullName" placeholder="Admin Trainium" />
        </div>
        <div className="field-shell">
          <label className="field-label">Email</label>
          <Input name="email" type="email" placeholder="admin@trainium.app" />
        </div>
        <div className="field-shell">
          <label className="field-label">Contrasena</label>
          <Input name="password" type="password" placeholder="Minimo 6 caracteres" />
        </div>
        <AuthFormSubmit idleLabel="Crear admin inicial" pendingLabel="Creando..." />
      </form>
    </StaffAuthShell>
  )
}
