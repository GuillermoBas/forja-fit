import Image from "next/image"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function StaffAuthShell({
  title,
  description,
  children,
  footer
}: {
  title?: string
  description: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="mobile-page-shell relative flex min-h-screen items-center justify-center overflow-hidden py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(18,191,166,0.10),_transparent_22%),radial-gradient(circle_at_center_right,_rgba(56,189,248,0.10),_transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <Card className="relative w-full max-w-[32rem] overflow-hidden rounded-[1.5rem] border-border/90 bg-card/98 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:rounded-[1.75rem]">
        <CardHeader className="space-y-5 px-5 pb-3 pt-6 sm:space-y-6 sm:px-6 sm:pb-4">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-border/80 bg-surface px-3 py-2 text-sm font-semibold text-text-secondary transition-all duration-200 hover:border-primary/20 hover:bg-primary-soft/55 hover:text-primary-hover"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a selección
          </Link>
          <Link
            href="/"
            className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-[1.5rem] border border-primary/15 bg-surface p-2 shadow-[0_14px_34px_rgba(18,191,166,0.12)] sm:h-36 sm:w-36 sm:rounded-[1.75rem]"
          >
            <Image
              src="/trainium-logo-full.png"
              alt="Logo de Trainium"
              width={280}
              height={280}
              priority
              className="h-full w-full rounded-[1.35rem] object-contain"
            />
          </Link>
          <div className="space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-muted">
              Portal de entrenadores
            </p>
            {title ? (
              <CardTitle className="font-heading text-[2rem] font-bold tracking-[-0.05em] sm:text-[2.35rem]">
                {title}
              </CardTitle>
            ) : null}
            <CardDescription className="mx-auto max-w-md text-sm leading-7 text-text-secondary sm:text-base">
              {description}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 px-5 pb-6 sm:space-y-6 sm:px-6">
          {children}
          {footer ? <div className="border-t border-border/70 pt-4">{footer}</div> : null}
        </CardContent>
      </Card>
    </div>
  )
}
