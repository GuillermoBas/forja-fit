"use client"

import Image from "next/image"
import { useEffect } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"

export function LoginForm({
  verifyStatus,
  errorMessage
}: {
  verifyStatus?: string
  errorMessage?: string
}) {
  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage)
    }
  }, [errorMessage])

  return (
    <div className="mobile-page-shell relative flex min-h-screen items-center justify-center overflow-hidden py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,106,0,0.08),_transparent_22%),radial-gradient(circle_at_center_right,_rgba(148,163,184,0.10),_transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <Card className="relative w-full max-w-[30rem] overflow-hidden rounded-[1.5rem] border-border/90 bg-card/98 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:rounded-[1.75rem]">
        <CardHeader className="space-y-5 px-5 pb-3 pt-6 sm:space-y-6 sm:px-6 sm:pb-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.5rem] border border-primary/15 bg-primary-soft p-2 shadow-[0_14px_34px_rgba(255,106,0,0.10)] sm:h-24 sm:w-24 sm:rounded-[1.75rem]">
            <Image
              src="/forjafit-logo.png"
              alt="Logo de ForjaFit"
              width={280}
              height={280}
              priority
              className="h-full w-full rounded-[1.35rem] object-cover"
            />
          </div>
          <div className="space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-muted">
              La plataforma inteligente para entrenadores personales
            </p>
            <CardDescription className="mx-auto max-w-md text-sm leading-7 text-text-secondary sm:text-base">
              Accede al portal de administración y entrenadores.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 px-5 pb-6 sm:space-y-6 sm:px-6">
          {verifyStatus === "success" ? (
            <div className="rounded-2xl border border-success/20 bg-success/10 p-3 text-sm text-success">
              Email verificado correctamente. Ya puedes iniciar sesión.
            </div>
          ) : null}
          <form className="space-y-5" action="/api/auth/login" method="post">
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
              <label className="field-label">Contrasena</label>
              <Input
                type="password"
                name="password"
                placeholder="********"
                autoComplete="current-password"
              />
            </div>
            <AuthFormSubmit idleLabel="Entrar" pendingLabel="Entrando..." />
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
