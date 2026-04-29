"use client"

import Link from "next/link"
import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import {
  exchangeResetCodeAction,
  resetPasswordAction,
  sendResetPasswordAction
} from "@/features/auth/actions"
import { StaffAuthShell } from "@/features/auth/staff-auth-shell"
import type { StaffAuthActionState } from "@/features/auth/server"

const initialState: StaffAuthActionState = {}

export function ResetPasswordForm() {
  const [sendState, sendAction] = useActionState(sendResetPasswordAction, initialState)
  const [codeState, codeAction] = useActionState(exchangeResetCodeAction, initialState)
  const [resetState, resetAction] = useActionState(resetPasswordAction, initialState)

  const email = resetState.email ?? codeState.email ?? sendState.email ?? ""
  const resetToken = resetState.resetToken ?? codeState.resetToken ?? ""
  const codeSent = Boolean(sendState.resetCodeSent || codeState.resetCodeSent || resetState.resetCodeSent)

  const currentError = resetState.error ?? codeState.error ?? sendState.error
  const currentSuccess = resetState.success ?? codeState.success ?? sendState.success

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
    <StaffAuthShell
      title="Recuperar acceso"
      description="Restablece la clave del panel staff con el codigo enviado a tu email."
      footer={
        <div className="text-sm">
          <Link href="/login" className="text-primary hover:underline">
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
            Hemos enviado un codigo a <strong>{email}</strong>.
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
    </StaffAuthShell>
  )
}
