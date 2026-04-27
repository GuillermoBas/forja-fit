"use client"

import * as Dialog from "@radix-ui/react-dialog"
import Link from "next/link"
import { useActionState, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cancelClientCalendarSessionAction, type PortalAgendaActionState } from "@/features/client-portal/agenda-actions"
import type { ClientCalendarSession } from "@/features/client-portal/data"
import { cn } from "@/lib/utils"
import {
  formatDateInAppTimeZone,
  getTodayDateKeyInAppTimeZone,
  toDateKeyInAppTimeZone
} from "@/lib/timezone"

type AgendaView = "week" | "month"

type CalendarDay = {
  key: string
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
}

const initialActionState: PortalAgendaActionState = {}
const weekDayLabels = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function parseDateKey(value: string) {
  return new Date(`${value}T00:00:00`)
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  const day = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - day)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date)
  next.setDate(next.getDate() + 6)
  next.setHours(23, 59, 59, 999)
  return next
}

function startOfMonthGrid(date: Date) {
  return startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1))
}

function buildMonthDays(date: Date) {
  const start = startOfMonthGrid(date)
  return Array.from({ length: 42 }, (_, index): CalendarDay => {
    const day = addDays(start, index)
    return {
      key: toDateKey(day),
      date: day,
      isCurrentMonth: day.getMonth() === date.getMonth(),
      isToday: toDateKey(day) === getTodayDateKeyInAppTimeZone()
    }
  })
}

function buildWeekDays(date: Date) {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, index): CalendarDay => {
    const day = addDays(start, index)
    return {
      key: toDateKey(day),
      date: day,
      isCurrentMonth: true,
      isToday: toDateKey(day) === getTodayDateKeyInAppTimeZone()
    }
  })
}

function formatHeadingDate(date: Date, view: AgendaView) {
  if (view === "month") {
    return formatDateInAppTimeZone(date, { month: "long", year: "numeric" })
  }

  const start = startOfWeek(date)
  const end = addDays(start, 6)
  return `${formatDateInAppTimeZone(start, { day: "numeric", month: "short" })} - ${formatDateInAppTimeZone(end, { day: "numeric", month: "short", year: "numeric" })}`
}

function getNavigationDate(date: Date, view: AgendaView, direction: -1 | 1) {
  return view === "month" ? addMonths(date, direction) : addDays(date, direction * 7)
}

function buildAgendaUrl(view: AgendaView, day: string) {
  return `/cliente/agenda?view=${view}&day=${day}`
}

function formatPortalStatus(status: ClientCalendarSession["status"]) {
  switch (status) {
    case "scheduled":
      return "Programada"
    case "completed":
      return "Realizada"
    case "cancelled":
      return "Cancelada"
    case "no_show":
      return "No asistida"
    default:
      return status
  }
}

function formatDuration(durationMin: number) {
  if (durationMin % 60 === 0) {
    return `${durationMin / 60} h`
  }

  return `${durationMin} min`
}

function getSessionsForDay(sessions: ClientCalendarSession[], dayKey: string) {
  return sessions
    .filter((session) => toDateKeyInAppTimeZone(session.startsAt) === dayKey)
    .sort((left, right) => {
      if (left.status === "cancelled" && right.status !== "cancelled") {
        return 1
      }

      if (left.status !== "cancelled" && right.status === "cancelled") {
        return -1
      }

      return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
    })
}

function SessionStatusBadge({ status }: { status: ClientCalendarSession["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
        status === "scheduled" && "bg-primary-soft text-primary-hover",
        status === "completed" && "bg-emerald-100 text-emerald-800",
        status === "cancelled" && "bg-slate-200 text-slate-700",
        status === "no_show" && "bg-amber-100 text-amber-800"
      )}
    >
      {formatPortalStatus(status)}
    </span>
  )
}

function SessionCard({
  session,
  compact = false,
  onOpen
}: {
  session: ClientCalendarSession
  compact?: boolean
  onOpen: (session: ClientCalendarSession) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(session)}
      className={cn(
        "w-full rounded-xl border border-border/80 bg-surface px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/20 hover:bg-surface-alt/55",
        compact ? "space-y-1" : "space-y-1.5"
      )}
      style={
        session.status === "cancelled"
          ? {
              backgroundColor: "#F1F5F9",
              borderColor: "#CBD5E1",
              color: "#475569"
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate font-semibold",
              session.status === "cancelled" ? "text-slate-600" : "text-text-primary",
              compact ? "text-[11px]" : "text-sm"
            )}
          >
            {session.displayTitle}
          </p>
          <p
            className={cn(
              "truncate",
              session.status === "cancelled" ? "text-slate-500" : "text-text-secondary",
              compact ? "text-[10px]" : "text-xs"
            )}
          >
            {formatDateInAppTimeZone(session.startsAt, { hour: "2-digit", minute: "2-digit" })} - {formatDateInAppTimeZone(session.endsAt, { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        {!compact ? <SessionStatusBadge status={session.status} /> : null}
      </div>
      <p
        className={cn(
          "truncate",
          session.status === "cancelled" ? "text-slate-500" : "text-text-secondary",
          compact ? "text-[10px]" : "text-xs"
        )}
      >
        {session.trainerName ? `Entrenador: ${session.trainerName}` : "Entrenador pendiente"}
      </p>
      {compact ? (
        <p className={cn("text-[10px] font-medium", session.status === "cancelled" ? "text-slate-500" : "text-text-secondary")}>
          {formatPortalStatus(session.status)}
        </p>
      ) : null}
    </button>
  )
}

function CancelSessionSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant="outline"
      disabled={disabled || pending}
      className="w-full rounded-2xl sm:w-auto"
    >
      {pending ? "Cancelando..." : "Cancelar sesion"}
    </Button>
  )
}

function SessionDetailDialog({
  session,
  open,
  onOpenChange
}: {
  session: ClientCalendarSession | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, formAction] = useActionState(cancelClientCalendarSessionAction, initialActionState)
  const router = useRouter()

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  useEffect(() => {
    if (state.success) {
      toast.success(state.success)
      onOpenChange(false)
      router.refresh()
    }
  }, [onOpenChange, router, state.success])

  if (!session) {
    return null
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-background/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[90] max-h-[88vh] rounded-t-[1.6rem] border border-border/90 bg-surface outline-none sm:inset-0 sm:m-auto sm:max-h-[80vh] sm:max-w-xl sm:rounded-[1.6rem]">
          <div className="flex max-h-[88vh] flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-border/80 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="section-kicker">Agenda</p>
                <Dialog.Title className="mt-1 truncate font-heading text-xl font-bold text-text-primary">
                  Detalle de sesion
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-text-secondary">
                  Consulta la informacion de tu cita y, si aplica, cancelala con antelacion.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button type="button" variant="outline" className="h-10 w-10 rounded-full p-0">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="rounded-2xl border border-border/80 bg-surface-alt/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-text-primary">{session.displayTitle}</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      {formatDateInAppTimeZone(session.startsAt, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric"
                      })}
                    </p>
                  </div>
                  <SessionStatusBadge status={session.status} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="rounded-2xl border-border/80">
                  <div className="space-y-1 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Hora</p>
                    <p className="text-sm text-text-primary">
                      {formatDateInAppTimeZone(session.startsAt, { hour: "2-digit", minute: "2-digit" })} - {formatDateInAppTimeZone(session.endsAt, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </Card>
                <Card className="rounded-2xl border-border/80">
                  <div className="space-y-1 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Duracion</p>
                    <p className="text-sm text-text-primary">{formatDuration(session.durationMin)}</p>
                  </div>
                </Card>
                <Card className="rounded-2xl border-border/80">
                  <div className="space-y-1 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Entrenador</p>
                    <p className="text-sm text-text-primary">{session.trainerName ?? "Pendiente"}</p>
                  </div>
                </Card>
                <Card className="rounded-2xl border-border/80">
                  <div className="space-y-1 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Tipo</p>
                    <p className="text-sm text-text-primary">
                      {session.isShared ? "Sesion compartida" : "Sesion individual"}
                    </p>
                    {session.isShared ? (
                      <p className="text-xs text-text-secondary">Otro titular</p>
                    ) : null}
                  </div>
                </Card>
              </div>

              <Card className="rounded-2xl border-border/80">
                <div className="space-y-3 p-4">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Cancelacion</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      Solo puedes cancelar una sesion hasta 24 horas antes.
                    </p>
                  </div>

                  {session.canCancel ? (
                    <form
                      action={formAction}
                      onSubmit={(event) => {
                        if (!window.confirm("Vas a cancelar esta sesion. Recuerda que solo se permite hacerlo con mas de 24 horas de antelacion. Quieres continuar?")) {
                          event.preventDefault()
                        }
                      }}
                    >
                      <input type="hidden" name="calendarSessionId" value={session.id} />
                      <CancelSessionSubmitButton disabled={false} />
                    </form>
                  ) : (
                    <div className="rounded-2xl border border-border/80 bg-surface-alt/35 px-3.5 py-3 text-sm text-text-secondary">
                      {session.cancellationReason ?? "Esta sesion no se puede cancelar."}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function AgendaCalendar({
  sessions,
  view,
  selectedDate
}: {
  sessions: ClientCalendarSession[]
  view: AgendaView
  selectedDate: string
}) {
  const baseDate = parseDateKey(selectedDate)
  const previousDate = toDateKey(getNavigationDate(baseDate, view, -1))
  const nextDate = toDateKey(getNavigationDate(baseDate, view, 1))
  const today = getTodayDateKeyInAppTimeZone()
  const weekDays = buildWeekDays(baseDate)
  const monthDays = buildMonthDays(baseDate)
  const [selectedSession, setSelectedSession] = useState<ClientCalendarSession | null>(null)

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-[1.1rem] border-border/90">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/80 bg-surface px-3 py-3">
          <Tabs value={view} className="w-auto">
            <TabsList className="h-10">
              <TabsTrigger asChild value="week" className="px-4">
                <Link href={buildAgendaUrl("week", selectedDate)}>Semana</Link>
              </TabsTrigger>
              <TabsTrigger asChild value="month" className="px-4">
                <Link href={buildAgendaUrl("month", selectedDate)}>Mes</Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link href={buildAgendaUrl(view, today)}>
                <CalendarDays className="mr-2 h-4 w-4" />
                Hoy
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-lg">
              <Link href={buildAgendaUrl(view, previousDate)} aria-label="Anterior">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="rounded-lg">
              <Link href={buildAgendaUrl(view, nextDate)} aria-label="Siguiente">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 border-b border-border/80 bg-surface-alt/55 px-3 py-2.5">
          <Clock className="h-4 w-4 text-text-muted" />
          <h3 className="font-heading text-lg font-bold capitalize text-text-primary sm:text-xl">
            {formatHeadingDate(baseDate, view)}
          </h3>
        </div>

        {view === "week" ? (
          <div className="grid gap-3 p-3 sm:p-4">
            {weekDays.map((day) => {
              const daySessions = getSessionsForDay(sessions, day.key)

              return (
                <section
                  key={day.key}
                  className={cn(
                    "rounded-2xl border border-border/80 bg-surface-alt/30 p-3",
                    day.isToday && "border-primary/25 bg-primary-soft/20"
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {weekDayLabels[(day.date.getDay() + 6) % 7]}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {formatDateInAppTimeZone(day.date, { day: "numeric", month: "long" })}
                      </p>
                    </div>
                    {day.isToday ? (
                      <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">
                        Hoy
                      </span>
                    ) : null}
                  </div>

                  {daySessions.length ? (
                    <div className="space-y-2">
                      {daySessions.map((session) => (
                        <SessionCard key={session.id} session={session} onOpen={setSelectedSession} />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border/80 bg-surface px-3 py-3 text-sm text-text-secondary">
                      No tienes sesiones este dia.
                    </p>
                  )}
                </section>
              )
            })}
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-7 border-b border-border/80 bg-surface text-[11px] font-semibold text-text-secondary sm:text-xs">
              {weekDayLabels.map((day) => (
                <div key={day} className="min-w-0 border-r border-border/80 px-2 py-2 text-center last:border-r-0">
                  {day.slice(0, 3)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 bg-border/70">
              {monthDays.map((day) => {
                const daySessions = getSessionsForDay(sessions, day.key)
                const visibleSessions = daySessions.slice(0, 2)

                return (
                  <div key={day.key} className="min-w-0 bg-surface p-1">
                    <div
                      className={cn(
                        "flex min-h-[6.9rem] flex-col gap-1 rounded-md border border-transparent p-1 sm:min-h-[8.6rem] sm:p-2",
                        !day.isCurrentMonth && "opacity-45",
                        day.isToday && "border-primary/35 bg-primary-soft/18"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-text-primary sm:text-xs",
                          day.isToday && "bg-primary text-white"
                        )}
                      >
                        {day.date.getDate()}
                      </span>

                      <div className="space-y-1 overflow-hidden">
                        {visibleSessions.map((session) => (
                          <SessionCard
                            key={session.id}
                            session={session}
                            compact
                            onOpen={setSelectedSession}
                          />
                        ))}
                        {daySessions.length > visibleSessions.length ? (
                          <p className="px-1 text-[10px] font-medium text-text-secondary">
                            +{daySessions.length - visibleSessions.length} mas
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      <SessionDetailDialog
        key={selectedSession?.id ?? "empty"}
        session={selectedSession}
        open={Boolean(selectedSession)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSession(null)
          }
        }}
      />
    </div>
  )
}
