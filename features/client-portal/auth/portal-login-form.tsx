"use client"

import Link from "next/link"
import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { portalSignInAction } from "@/features/client-portal/auth/actions"
import { PortalAuthShell } from "@/features/client-portal/auth/portal-auth-shell"
import type { PortalActionState } from "@/features/client-portal/auth/server"

const initialState: PortalActionState = {}

export function PortalLoginForm({
  errorMessage,
  resetStatus
}: {
  errorMessage?: string
  resetStatus?: string
}) {
  const [state, formAction] = useActionState(portalSignInAction, initialState)

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage)
    }
  }, [errorMessage])

  useEffect(() => {
    if (resetStatus === "success") {
      toast.success("Clave actualizada. Ya puedes acceder al portal.")
    }
  }, [resetStatus])

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  return (
    <PortalAuthShell
      description="Inicia sesión con tu email o cuenta de Google."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href="/cliente/registro" className="text-primary hover:underline">
            Registrarse
          </Link>
          <Link
            href="/cliente/recuperar-clave"
            className="text-text-secondary hover:text-text-primary hover:underline"
          >
            Recuperar contraseña
          </Link>
        </div>
      }
    >
      {errorMessage ? (
        <div className="rounded-2xl border border-error/20 bg-error/10 p-3 text-sm text-error">
          {errorMessage}
        </div>
      ) : null}

      <Button asChild variant="outline" className="w-full">
        <Link href="/api/cliente/auth/oauth/google" prefetch={false}>Acceder con Google</Link>
      </Button>

      <div className="space-y-3">
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-text-muted">
          <span className="h-px flex-1 bg-border/70" />
          <span>o continuar con</span>
          <span className="h-px flex-1 bg-border/70" />
        </div>

        <form className="space-y-4" action={formAction}>
          <div className="field-shell">
            <label className="field-label">Email</label>
            <Input
              type="email"
              name="email"
              placeholder="email@dominio.com"
              autoComplete="email"
            />
          </div>
          <div className="field-shell">
            <label className="field-label">Contraseña</label>
            <Input
              type="password"
              name="password"
              placeholder="********"
              autoComplete="current-password"
            />
          </div>
          <AuthFormSubmit idleLabel="Entrar al portal" pendingLabel="Entrando..." />
        </form>
      </div>
    </PortalAuthShell>
  )
}
