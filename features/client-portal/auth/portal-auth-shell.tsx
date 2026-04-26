import Link from "next/link"
import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function PortalAuthShell({
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,106,0,0.08),_transparent_22%),radial-gradient(circle_at_center_right,_rgba(148,163,184,0.10),_transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <Card className="relative w-full max-w-[32rem] overflow-hidden rounded-[1.5rem] border-border/90 bg-card/98 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:rounded-[1.75rem]">
        <CardHeader className="space-y-5 px-5 pb-3 pt-6 sm:space-y-6 sm:px-6 sm:pb-4">
          <Link
            href="/"
            className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.5rem] border border-primary/15 bg-primary-soft p-2 shadow-[0_14px_34px_rgba(255,106,0,0.10)] sm:h-24 sm:w-24 sm:rounded-[1.75rem]"
          >
            <Image
              src="/forjafit-logo.png"
              alt="Logo de ForjaFit"
              width={280}
              height={280}
              priority
              className="h-full w-full rounded-[1.35rem] object-cover"
            />
          </Link>
          <div className="space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-muted">
              Portal de cliente
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
