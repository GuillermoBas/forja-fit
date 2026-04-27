"use client"

import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { bootstrapFirstAdminAction } from "@/features/auth/actions"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"

export function BootstrapAdminForm() {
  const [state, formAction] = useActionState(bootstrapFirstAdminAction, {})

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md rounded-3xl">
        <CardHeader>
          <CardTitle>Bootstrap del primer admin</CardTitle>
          <CardDescription>
            Este acceso solo debe estar abierto mientras no exista ningun administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre completo</label>
              <Input name="fullName" placeholder="Admin ForjaFit" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input name="email" type="email" placeholder="admin@forjafit.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Contrasena</label>
              <Input name="password" type="password" placeholder="Minimo 8 caracteres" />
            </div>
            <AuthFormSubmit idleLabel="Crear admin inicial" pendingLabel="Creando..." />
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
