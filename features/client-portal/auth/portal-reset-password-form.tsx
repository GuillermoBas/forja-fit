"use client"

import Link from "next/link"
import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import {
  portalExchangeResetCodeAction,
  portalResetPasswordAction,
  portalSendResetPasswordAction
} from "@/features/client-portal/auth/actions"
import { PortalAuthShell } from "@/features/client-portal/auth/portal-auth-shell"
import type { PortalActionState } from "@/features/client-portal/auth/server"

const initialState: PortalActionState = {}

export function PortalResetPasswordForm() {
  const [sendState, sendAction] = useActionState(portalSendResetPasswordAction, initialState)
  const [codeState, codeAction] = useActionState(portalExchangeResetCodeAction, initialState)
  const [resetState, resetAction] = useActionState(portalResetPasswordAction, initialState)

  const email =
    (resetState.email as string | undefined) ??
    (codeState.email as string | undefined) ??
    (sendState.email as string | undefined) ??
    ""
  const resetToken =
    (resetState.resetToken as string | undefined) ??
    (codeState.resetToken as string | undefined) ??
    ""
  const codeSent = Boolean(sendState.resetCodeSent || codeState.resetCodeSent || resetState.resetCodeSent)

  const currentError =
    (resetState.error as string | undefined) ??
    (codeState.error as string | undefined) ??
    (sendState.error as string | undefined)
  const currentSuccess =
    (resetState.success as string | undefined) ??
    (codeState.success as string | undefined) ??
    (sendState.success as string | undefined)

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
      title="Recuperar clave"
      description="Restablece la clave del portal con el código enviado a tu email."
      footer={
        <div className="text-sm">
          <Link href="/cliente/login" className="text-primary hover:underline">
            Volver al acceso
          </Link>
        </div>
      }
    >
      {!codeSent ? (
        <form className="space-y-4" action={sendAction}>
          <div className="field-shell">
            <label className="field-label">Email</label>
            <Input type="email" name="email" placeholder="email@dominio.com" autoComplete="email" />
          </div>
          <AuthFormSubmit idleLabel="Enviar codigo" pendingLabel="Enviando..." />
        </form>
      ) : !resetToken ? (
        <form className="space-y-4" action={codeAction}>
          <input type="hidden" name="email" value={email} />
          <div className="rounded-2xl border border-success/20 bg-success/10 p-3 text-sm text-success">
            Hemos enviado un código a <strong>{email}</strong>.
          </div>
          <div className="field-shell">
            <label className="field-label">Codigo de recuperacion</label>
            <Input name="code" placeholder="123456" inputMode="numeric" autoComplete="one-time-code" />
          </div>
          <AuthFormSubmit idleLabel="Validar codigo" pendingLabel="Validando..." />
        </form>
      ) : (
        <form className="space-y-4" action={resetAction}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="resetToken" value={resetToken} />
          <div className="field-shell">
            <label className="field-label">Nueva clave</label>
            <Input type="password" name="newPassword" placeholder="Minimo 6 caracteres" autoComplete="new-password" />
          </div>
          <div className="field-shell">
            <label className="field-label">Confirmar nueva clave</label>
            <Input type="password" name="confirmPassword" placeholder="Repite la nueva clave" autoComplete="new-password" />
          </div>
          <AuthFormSubmit idleLabel="Guardar nueva clave" pendingLabel="Actualizando..." />
        </form>
      )}
    </PortalAuthShell>
  )
}
