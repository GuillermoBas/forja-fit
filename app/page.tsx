import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, ShieldCheck, UserRound } from "lucide-react"
import { TenantLogo } from "@/components/branding"
import { Card } from "@/components/ui/card"
import { getCurrentProfile } from "@/lib/auth/session"
import { getCurrentPortalAccount } from "@/lib/auth/portal-session"
import { getCurrentBranding } from "@/lib/branding"
import { getCurrentGym } from "@/lib/tenant"

const accessOptions = [
  {
    href: "/login",
    label: "Entrenador",
    description: "Gestiona clientes, bonos, ventas, agenda e informes.",
    icon: ShieldCheck
  },
  {
    href: "/cliente/login",
    label: "Cliente",
    description: "Revisa tu actividad, tus planes y el asistente nutricional.",
    icon: UserRound
  }
]

export default async function HomePage() {
  const [gym, profile, portalAccount, branding] = await Promise.all([
    getCurrentGym(),
    getCurrentProfile(),
    getCurrentPortalAccount(),
    getCurrentBranding()
  ])

  if (!gym) {
    return (
      <main className="mobile-page-shell flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Card className="w-full max-w-lg rounded-2xl border-border/90 bg-surface p-6 text-center shadow-sm">
          <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-surface p-2">
            <TenantLogo
              width={160}
              height={160}
              priority
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="mt-5 font-heading text-2xl font-bold text-text-primary">
            Elige tu gimnasio
          </h1>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Accede desde el subdominio asignado a tu centro, por ejemplo
            {" "}
            <span className="font-semibold text-text-primary">eltemplo.trainium.es</span>.
          </p>
        </Card>
      </main>
    )
  }

  if (profile) {
    redirect("/dashboard")
  }

  if (portalAccount) {
    redirect("/cliente/dashboard")
  }

  return (
    <main className="mobile-page-shell relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(18,191,166,0.14),_transparent_20%),radial-gradient(circle_at_80%_10%,_rgba(56,189,248,0.10),_transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.96))]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] min-h-[calc(100dvh-2rem)] w-full max-w-4xl items-center justify-center">
        <Card className="w-full rounded-[1.9rem] border-border/90 bg-surface/96 px-5 py-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:px-8 sm:py-10">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-[1.7rem] border border-primary/15 bg-surface p-2 shadow-[0_18px_38px_rgba(18,191,166,0.12)] sm:h-40 sm:w-40">
              <TenantLogo
                width={320}
                height={320}
                priority
                className="h-full w-full rounded-[1.35rem] object-contain"
              />
            </div>

            <h1 className="mt-5 text-center font-heading text-[2.35rem] font-bold tracking-[-0.06em] text-text-primary sm:text-[3rem]">
              {branding.businessName}
            </h1>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-muted sm:text-xs">
              La plataforma inteligente para entrenadores personales
            </p>

            <div className="mt-8 grid w-full gap-4 sm:mt-10">
              {accessOptions.map((option) => {
                const Icon = option.icon

                return (
                  <Link key={option.href} href={option.href} className="block">
                    <div className="group rounded-[1.6rem] border border-border/90 bg-surface px-4 py-4 text-left shadow-[0_10px_28px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)] sm:px-5 sm:py-5">
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary-soft text-primary-hover shadow-[0_8px_20px_rgba(18,191,166,0.10)]">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <h2 className="font-heading text-[1.45rem] font-bold tracking-[-0.04em] text-text-primary">
                              {option.label}
                            </h2>
                            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary-hover" />
                          </div>
                          <p className="mt-1.5 text-sm leading-6 text-text-secondary">
                            {option.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </Card>
      </div>
    </main>
  )
}
