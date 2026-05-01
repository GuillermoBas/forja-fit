"use client"

import Link from "next/link"
import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { verifyStaffEmailAction } from "@/features/auth/actions"
import { StaffAuthShell } from "@/features/auth/staff-auth-shell"
import type { StaffAuthActionState } from "@/features/auth/server"

const initialState: StaffAuthActionState = {}

export function LoginForm({
  verifyStatus,
  errorMessage,
  resetStatus,
  activationRequired = false,
  activationEmail,
  canBootstrap
}: {
  verifyStatus?: string
  errorMessage?: string
  resetStatus?: string
  activationRequired?: boolean
  activationEmail?: string
  canBootstrap: boolean
}) {
  const [activationState, activationAction] = useActionState(verifyStaffEmailAction, initialState)
  const normalizedRouteError =
    errorMessage === "Invalid credentials" ? "Email o Contrasena incorrectos." : errorMessage
  const normalizedErrorMessage = normalizedRouteError ?? activationState.error
  const resolvedActivationEmail = activationState.email ?? activationEmail ?? ""
  const showActivationForm = activationRequired || Boolean(activationState.verificationRequired)

  useEffect(() => {
    if (normalizedErrorMessage) {
      toast.error(normalizedErrorMessage)
    }
  }, [normalizedErrorMessage])

  useEffect(() => {
    if (resetStatus === "success") {
      toast.success("Clave actualizada. Ya puedes acceder al panel staff.")
    }
  }, [resetStatus])

  return (
    <StaffAuthShell
      description="Accede al portal de administracion y entrenadores con Google o Email."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          {canBootstrap ? (
            <Link href="/setup/bootstrap-admin" className="text-primary hover:underline">
              Crear admin inicial
            </Link>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={
                resolvedActivationEmail
                  ? `/login?activation=required&email=${encodeURIComponent(resolvedActivationEmail)}`
                  : "/login?activation=required"
              }
              className="text-text-secondary hover:text-text-primary hover:underline"
            >
              Ya tengo codigo de activacion
            </Link>
            <Link
              href="/recuperar-clave"
              className="text-text-secondary hover:text-text-primary hover:underline"
            >
              Recuperar contrasena
            </Link>
          </div>
        </div>
      }
    >
      {verifyStatus === "success" ? (
        <div className="rounded-2xl border border-success/20 bg-success/10 p-3 text-sm text-success">
          Email verificado correctamente. Ya puedes iniciar sesion.
        </div>
      ) : null}

      {normalizedErrorMessage ? (
        <div className="rounded-2xl border border-error/20 bg-error/10 p-3 text-sm text-error">
          {normalizedErrorMessage}
        </div>
      ) : null}

      {showActivationForm ? (
        <form className="space-y-4" action={activationAction}>
          <div className="rounded-2xl border border-primary/20 bg-primary-soft/40 p-3 text-sm text-text-primary">
            Este usuario staff todavia no esta activado. Introduce el codigo recibido por email para completar el acceso.
          </div>
          <div className="field-shell">
            <label className="field-label">Email</label>
            <Input
              type="email"
              name="email"
              defaultValue={resolvedActivationEmail}
              placeholder="email@dominio.com"
              autoComplete="email"
            />
          </div>
          <div className="field-shell">
            <label className="field-label">Codigo de activacion</label>
            <Input
              name="otp"
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </div>
          <AuthFormSubmit idleLabel="Activar y entrar" pendingLabel="Verificando..." />
          <div className="text-sm">
            <Link href="/login" className="text-primary hover:underline">
              Volver al acceso normal
            </Link>
          </div>
        </form>
      ) : (
        <>
          <Button asChild variant="outline" className="w-full">
            <Link href="/api/auth/oauth/google">Acceder con Google</Link>
          </Button>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-text-muted">
              <span className="h-px flex-1 bg-border/70" />
              <span>o continuar con</span>
              <span className="h-px flex-1 bg-border/70" />
            </div>

            <form className="space-y-5" action="/api/auth/login" method="post">
              <div className="field-shell">
                <label className="field-label">Email</label>
                <Input
                  type="email"
                  name="email"
                  placeholder="email@dominio.com"
                  autoComplete="email"
                  defaultValue={resolvedActivationEmail}
                />
              </div>
              <div className="field-shell">
                <label className="field-label">Contrasena</label>
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
        </>
      )}
    </StaffAuthShell>
  )
}
