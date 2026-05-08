"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowUpRight, BellRing, Box, CalendarClock, Wallet, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn, formatCurrency, formatDate, formatPassStatus } from "@/lib/utils"
import type { Pass } from "@/types/domain"

type DashboardKpi = {
  label: string
  value: string
}

type PassListKey = "active" | "expiringSoon" | "outOfSessions"

type PassLists = Record<PassListKey, Pass[]>

const kpiIcons = [CalendarClock, AlertTriangle, ArrowUpRight, Box, Wallet, BellRing, Wallet]

const passListConfigs: Record<PassListKey, { key: PassListKey; title: string; description: string }> = {
  active: {
    key: "active",
    title: "Bonos activos",
    description: "Bonos en estado activo con titulares, sesiones, caducidad y datos económicos."
  },
  expiringSoon: {
    key: "expiringSoon",
    title: "Bonos que caducan en 7 días",
    description: "Bonos activos cuya fecha de caducidad entra en la ventana operativa de seguimiento."
  },
  outOfSessions: {
    key: "outOfSessions",
    title: "Bonos sin sesiones",
    description: "Bonos de sesiones con saldo a cero para revisar renovación o cierre."
  }
}

function getClickableKpiConfig(label: string) {
  if (label === "Bonos activos") {
    return passListConfigs.active
  }

  if (label.includes("Caducan")) {
    return passListConfigs.expiringSoon
  }

  if (label === "Sin sesiones") {
    return passListConfigs.outOfSessions
  }

  return null
}

function getBadgeVariant(status: Pass["status"]) {
  switch (status) {
    case "active":
      return "success" as const
    case "paused":
      return "paused" as const
    case "out_of_sessions":
      return "warning" as const
    case "expired":
    case "cancelled":
      return "danger" as const
    default:
      return "secondary" as const
  }
}

function PassDetailList({ passes }: { passes: Pass[] }) {
  if (!passes.length) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">No hay bonos en este listado</p>
        <p className="empty-state-copy">Cuando exista algún bono que cumpla el criterio, aparecerá aquí.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {passes.map((pass) => (
        <article key={pass.id} className="rounded-2xl border border-border/90 bg-surface p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-text-primary">{pass.passTypeName}</h3>
                <Badge variant={getBadgeVariant(pass.status)}>{formatPassStatus(pass.status)}</Badge>
                <Badge variant="secondary">{pass.passKind === "monthly" ? "Mensual" : "Sesiones"}</Badge>
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                Titulares: <span className="font-medium text-text-primary">{pass.holderNames.join(" / ")}</span>
              </p>
              {pass.purchasedByName ? (
                <p className="text-sm leading-6 text-text-secondary">
                  Pagado por: <span className="font-medium text-text-primary">{pass.purchasedByName}</span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {pass.holderClientIds.slice(0, 3).map((clientId, index) => (
                <Button key={clientId} asChild variant="outline" size="sm">
                  <Link href={`/clients/${clientId}`}>Cliente {index + 1}</Link>
                </Button>
              ))}
              <Button asChild variant="outline" size="sm">
                <Link href={`/passes/${pass.id}/edit`}>Editar bono</Link>
              </Button>
            </div>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl bg-surface-alt px-3 py-2">
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">Contratado</dt>
              <dd className="mt-1 text-sm font-semibold text-text-primary">{formatDate(pass.contractedOn)}</dd>
            </div>
            <div className="rounded-xl bg-surface-alt px-3 py-2">
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">Caducidad</dt>
              <dd className="mt-1 text-sm font-semibold text-text-primary">{formatDate(pass.expiresOn)}</dd>
            </div>
            <div className="rounded-xl bg-surface-alt px-3 py-2">
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">Sesiones</dt>
              <dd className="mt-1 text-sm font-semibold text-text-primary">
                {pass.passKind === "monthly" ? "Mensual" : `${pass.sessionsLeft ?? 0} / ${pass.originalSessions ?? 0}`}
              </dd>
            </div>
            <div className="rounded-xl bg-surface-alt px-3 py-2">
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">Importe</dt>
              <dd className="mt-1 text-sm font-semibold text-text-primary">{formatCurrency(pass.soldPriceGross)}</dd>
            </div>
            <div className="rounded-xl bg-surface-alt px-3 py-2">
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">ID bono</dt>
              <dd className="mt-1 truncate text-sm font-semibold text-text-primary">{pass.id}</dd>
            </div>
          </dl>

          {pass.notes ? (
            <p className="mt-4 rounded-xl border border-border/80 bg-surface-alt px-3 py-2 text-sm leading-6 text-text-secondary">
              {pass.notes}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  )
}

export function DashboardKpiListModals({ kpis, passLists }: { kpis: DashboardKpi[]; passLists: PassLists }) {
  const [openList, setOpenList] = useState<PassListKey | null>(null)
  const openConfig = useMemo(() => (openList ? passListConfigs[openList] : null), [openList])
  const openPasses = openList ? passLists[openList] : []

  useEffect(() => {
    if (!openList) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenList(null)
      }
    }

    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [openList])

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((item, index) => {
          const Icon = kpiIcons[index % kpiIcons.length]
          const isAlert = item.label.includes("Caducan") || item.label.includes("Stock")
          const isMoney = item.label.includes("Ventas")
          const clickable = getClickableKpiConfig(item.label)
          const cardTone = isAlert
            ? "border-warning/18 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(255,247,237,0.98))]"
            : isMoney
              ? "border-success/18 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(240,253,244,0.98))]"
              : "border-border/90 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(248,250,252,0.98))]"
          const content = (
            <>
              <CardHeader className="relative pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3 text-left">
                    <p className="metric-label">
                      {isMoney ? "Facturación" : isAlert ? "Atención" : "Resumen"}
                    </p>
                    <CardTitle className="text-[15px] font-semibold text-text-secondary">
                      {item.label}
                    </CardTitle>
                  </div>
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                      isAlert
                        ? "border-warning/18 bg-warning/10 text-warning"
                        : isMoney
                          ? "border-success/18 bg-success/10 text-success"
                          : "border-primary/18 bg-primary-soft text-primary-hover"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-left">
                <p className="kpi-value">
                  {item.label.includes("Ventas") ? formatCurrency(Number(item.value)) : item.value}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isAlert ? "bg-warning" : isMoney ? "bg-success" : "bg-primary"
                    )}
                  />
                  <p className="kpi-meta">
                    {isMoney
                      ? "Facturación registrada"
                      : isAlert
                        ? "Requiere seguimiento"
                        : "Estado operativo"}
                  </p>
                </div>
              </CardContent>
            </>
          )

          if (!clickable) {
            return (
              <Card key={item.label} className={cn("panel-hover overflow-hidden", cardTone)}>
                {content}
              </Card>
            )
          }

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setOpenList(clickable.key)}
              className="group block rounded-3xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              aria-label={`Ver listado de ${item.label.toLowerCase()}`}
            >
              <Card className={cn("panel-hover h-full overflow-hidden transition-transform group-hover:-translate-y-0.5", cardTone)}>
                {content}
              </Card>
            </button>
          )
        })}
      </section>

      {openConfig ? (
        <div className="fixed inset-0 z-50 bg-slate-950/55 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="dashboard-pass-list-title">
          <div className="flex h-full flex-col overflow-hidden bg-background shadow-2xl sm:rounded-3xl">
            <header className="border-b border-border/80 bg-surface px-4 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="section-kicker">Detalle de bonos</p>
                  <h2 id="dashboard-pass-list-title" className="mt-1 text-2xl font-semibold text-text-primary">
                    {openConfig.title}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{openConfig.description}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setOpenList(null)} aria-label="Cerrar listado">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Cerrar</span>
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{openPasses.length} bonos</Badge>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto bg-background p-4 sm:p-6">
              <PassDetailList passes={openPasses} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
