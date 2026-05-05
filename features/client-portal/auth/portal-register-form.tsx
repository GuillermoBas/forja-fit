"use client"

import Link from "next/link"
import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import {
  portalSignUpAction,
  portalVerifyEmailAction
} from "@/features/client-portal/auth/actions"
import { PortalAuthShell } from "@/features/client-portal/auth/portal-auth-shell"
import type { PortalActionState } from "@/features/client-portal/auth/server"

const initialState: PortalActionState = {}

export function PortalRegisterForm() {
  const [registerState, registerAction] = useActionState(portalSignUpAction, initialState)
  const [verifyState, verifyAction] = useActionState(portalVerifyEmailAction, initialState)

  const verificationEmail =
    (verifyState.email as string | undefined) ??
    (registerState.email as string | undefined) ??
    ""

  const verificationRequired = Boolean(
    registerState.verificationRequired || verifyState.verificationRequired
  )
  const currentError =
    (verifyState.error as string | undefined) ?? (registerState.error as string | undefined)
  const currentSuccess =
    (verifyState.success as string | undefined) ?? (registerState.success as string | undefined)

  useEffect(() => {
    if (currentError) {
      toast.error(currentError)
    }
  }, [currentError])

  useEffect(() => {
    if (currentSuccess) {
      toast.success(currentSuccess)
    }
  }, [currentSuccess])

  return (
    <PortalAuthShell
      description="Regístrate con el mismo email que ya figure en tu ficha de cliente."
      footer={
        <div className="text-sm">
          <Link href="/cliente/login" className="text-primary hover:underline">
            Ya estoy registrado
          </Link>
        </div>
      }
    >
      {!verificationRequired ? (
        <>
          <Button asChild variant="outline" className="w-full">
            <Link href="/api/cliente/auth/oauth/google" prefetch={false}>Registrarme con Google</Link>
          </Button>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-text-muted">
              <span className="h-px flex-1 bg-border/70" />
              <span>o continuar con</span>
              <span className="h-px flex-1 bg-border/70" />
            </div>

            <form className="space-y-4" action={registerAction}>
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
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div className="field-shell">
                <label className="field-label">Confirmar contraseña</label>
                <Input
                  type="password"
                  name="confirmPassword"
                  placeholder="Repite tu contraseña"
                  autoComplete="new-password"
                />
              </div>
              <AuthFormSubmit idleLabel="Registrarme" pendingLabel="Registrándome..." />
            </form>
          </div>
        </>
      ) : (
        <form className="space-y-4" action={verifyAction}>
          <div className="rounded-2xl border border-success/20 bg-success/10 p-3 text-sm text-success">
            Hemos enviado un código de verificación a <strong>{verificationEmail}</strong>.
          </div>
          <input type="hidden" name="email" value={verificationEmail} />
          <div className="field-shell">
            <label className="field-label">Código de verificación</label>
            <Input
              name="otp"
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </div>
          <AuthFormSubmit idleLabel="Verificar y acceder" pendingLabel="Verificando..." />
        </form>
      )}
    </PortalAuthShell>
  )
}
