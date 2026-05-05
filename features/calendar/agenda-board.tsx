"use client"

import Link from "next/link"
import { useActionState, useEffect, useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Clock, ListFilter, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import {
  cancelCalendarSessionAction,
  upsertCalendarSessionAction
} from "@/features/calendar/actions"
import {
  formatDateInAppTimeZone,
  getHourInAppTimeZone,
  getTodayDateKeyInAppTimeZone,
  toDateKeyInAppTimeZone,
  toDateTimeLocalInAppTimeZone
} from "@/lib/timezone"
import { cn, nativeSelectClassName } from "@/lib/utils"
import type { CalendarSession, Pass, Profile } from "@/types/domain"

type AgendaView = "day" | "week" | "month"

type TrainerOption = {
  id: string
  fullName: string
  role: string
  calendarColor: string
}

type AgendaSlot = {
  startsAt: string
  endsAt: string
}

type ModalState =
  | { mode: "create"; slot: AgendaSlot }
  | { mode: "edit"; session: CalendarSession }
  | null

const hours = Array.from({ length: 16 }, (_, index) => index + 7)
const weekDayLabels = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function toDateTimeLocal(date: Date) {
  return `${toDateKey(date)}T${pad(date.getHours())}:00`
}

function parseDateKey(value: string) {
  return new Date(`${value}T00:00:00`)
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
  return next
}

function buildMonthDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}

function formatHeadingDate(date: Date, view: AgendaView) {
  if (view === "week") {
    const start = startOfWeek(date)
    const end = addDays(start, 6)
    return `${formatDateInAppTimeZone(start, { day: "numeric", month: "short" })} - ${formatDateInAppTimeZone(end, { day: "numeric", month: "short", year: "numeric" })}`
  }

  if (view === "month") {
    return formatDateInAppTimeZone(date, { month: "long", year: "numeric" })
  }

  return formatDateInAppTimeZone(date, { day: "numeric", month: "long", year: "numeric" })
}

function getNavigationDate(date: Date, view: AgendaView, direction: -1 | 1) {
  if (view === "month") {
    return addMonths(date, direction)
  }

  return addDays(date, view === "week" ? direction * 7 : direction)
}

function sameHour(value: string, day: Date, hour: number) {
  return toDateKeyInAppTimeZone(value) === toDateKey(day) && getHourInAppTimeZone(value) === hour
}

function makeSlot(day: Date, hour: number): AgendaSlot {
  const starts = new Date(day)
  starts.setHours(hour, 0, 0, 0)
  const ends = new Date(starts)
  ends.setHours(hour + 1, 0, 0, 0)
  return {
    startsAt: toDateTimeLocal(starts),
    endsAt: toDateTimeLocal(ends)
  }
}

function getPassLabel(pass: Pass) {
  const sessions = pass.passKind === "session" ? ` - ${pass.sessionsLeft ?? 0} sesiones` : " - mensual"
  return `${pass.passTypeName}${sessions} - ${pass.holderNames.join(" / ")}`
}

function getSelectedClientNames(passes: Pass[], selectedPassIds: string[]) {
  const selected = new Set(selectedPassIds)
  return Array.from(
    new Set(
      passes
        .filter((pass) => selected.has(pass.id))
        .flatMap((pass) => pass.holderNames)
        .filter(Boolean)
    )
  )
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

function buildAgendaUrl(view: AgendaView, day: string, trainerId: string) {
  return `/agenda?view=${view}&day=${day}&trainer=${trainerId}`
}

function compareAgendaSessions(left: CalendarSession, right: CalendarSession) {
  if (left.status === "cancelled" && right.status !== "cancelled") {
    return 1
  }

  if (left.status !== "cancelled" && right.status === "cancelled") {
    return -1
  }

  return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
}

function getAgendaStatusLabel(status: CalendarSession["status"]) {
  return status === "scheduled"
    ? "Programada"
    : status === "completed"
      ? "Consumida"
      : status === "no_show"
        ? "No asistió"
        : "Cancelada"
}

function AgendaEventButton({
  session,
  onOpen
}: {
  session: CalendarSession
  onOpen: (session: CalendarSession) => void
}) {
  const statusLabel = getAgendaStatusLabel(session.status)
  const sessionTitle = session.clientNames.join(" / ") || "Sesion"

  return (
    <div className="group relative z-0 hover:z-20 focus-within:z-20">
      <button
        type="button"
        onClick={() => onOpen(session)}
        className="w-full rounded-md border px-2 py-1.5 text-left text-[12px] leading-4 shadow-sm transition hover:-translate-y-0.5"
        style={{
          backgroundColor: session.status === "cancelled" ? "#E2E8F0" : session.trainerColor,
          borderColor: session.status === "cancelled" ? "#CBD5E1" : session.trainerColor,
          color: session.status === "cancelled" ? "#475569" : "#0f172a"
        }}
      >
        <span className="block truncate font-semibold">{sessionTitle}</span>
        <span className="block truncate opacity-80">
          {formatDateInAppTimeZone(session.startsAt, { hour: "2-digit", minute: "2-digit" })} - {statusLabel}
        </span>
      </button>
      <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-72 rounded-2xl border border-border/90 bg-surface p-3 text-left shadow-[0_18px_45px_rgba(15,23,42,0.22)] group-hover:block group-focus-within:block">
        <p className="text-sm font-semibold text-text-primary">{sessionTitle}</p>
        <p className="mt-1 text-xs text-text-secondary">
          {formatDateInAppTimeZone(session.startsAt, {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit"
          })}
          {" - "}
          {formatDateInAppTimeZone(session.endsAt, { hour: "2-digit", minute: "2-digit" })}
        </p>
        <p className="mt-2 text-xs text-text-secondary">Estado: {statusLabel}</p>
        <p className="mt-1 text-xs text-text-secondary">Entrenador: {session.trainerName}</p>
        {session.notes ? (
          <p className="mt-2 text-xs leading-5 text-text-secondary">{session.notes}</p>
        ) : null}
      </div>
    </div>
  )
}

function AgendaModal({
  state,
  currentProfile,
  trainers,
  passes,
  selectedTrainerId,
  returnTo,
  canManageSelectedTrainer,
  onClose
}: {
  state: ModalState
  currentProfile: Profile
  trainers: TrainerOption[]
  passes: Pass[]
  selectedTrainerId: string
  returnTo: string
  canManageSelectedTrainer: boolean
  onClose: () => void
}) {
  const [formState, formAction] = useActionState(upsertCalendarSessionAction, {})
  const [deleteState, deleteAction] = useActionState(cancelCalendarSessionAction, {})
  const editingSession = state?.mode === "edit" ? state.session : null
  const canManage = Boolean(editingSession
    ? currentProfile.role === "admin" || editingSession.trainerProfileId === currentProfile.id
    : canManageSelectedTrainer)
  const modalIdentity = state?.mode === "create" ? state.slot.startsAt : editingSession?.id
  const initialSelectedPassIds = state?.mode === "edit" ? state.session.passIds : []
  const [selectedPassIds, setSelectedPassIds] = useState<string[]>(initialSelectedPassIds)
  const [passSearch, setPassSearch] = useState("")
  const eligiblePasses = passes
  const normalizedPassSearch = normalizeSearchText(passSearch)
  const visiblePasses = eligiblePasses.filter((pass) => {
    if (!normalizedPassSearch) {
      return true
    }

    const searchableText = normalizeSearchText(
      `${getPassLabel(pass)} ${pass.holderNames.join(" ")}`
    )

    return searchableText.includes(normalizedPassSearch)
  })
  const clientNames = getSelectedClientNames(passes, selectedPassIds)

  useEffect(() => {
    setSelectedPassIds(state?.mode === "edit" ? state.session.passIds : [])
    setPassSearch("")
  }, [modalIdentity, state])

  if (!state) {
    return null
  }

  const startsAt = state.mode === "create" ? state.slot.startsAt : toDateTimeLocalInAppTimeZone(state.session.startsAt)
  const endsAt = state.mode === "create" ? state.slot.endsAt : toDateTimeLocalInAppTimeZone(state.session.endsAt)
  const trainerProfileId = editingSession?.trainerProfileId ?? selectedTrainerId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.3rem] border border-border/90 bg-surface p-5 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Agenda Trainium</p>
            <h3 className="mt-2 font-heading text-2xl font-bold text-text-primary">
              {state.mode === "create" ? "Agendar sesión" : "Detalle de sesión"}
            </h3>
          </div>
          <Button type="button" variant="ghost" className="rounded-2xl" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        {formState.error ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{formState.error}</p> : null}
        {deleteState.error ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{deleteState.error}</p> : null}

        <form action={formAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <input type="hidden" name="id" value={editingSession?.id ?? ""} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="space-y-2">
            <label className="text-sm font-medium">Entrenador</label>
            <select
              name="trainerProfileId"
              defaultValue={trainerProfileId}
              disabled={!canManage}
              className={cn(nativeSelectClassName, "bg-surface disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-text-muted")}
            >
              {trainers.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>
                  {trainer.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Estado</label>
            <select
              name="status"
              defaultValue={editingSession?.status ?? "scheduled"}
              disabled={!canManage}
              className={cn(nativeSelectClassName, "bg-surface disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-text-muted")}
            >
              <option value="scheduled">Programada</option>
              <option value="completed">Consumida</option>
              <option value="no_show">No asistió</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Inicio</label>
            <Input name="startsAt" type="datetime-local" step={3600} defaultValue={startsAt} disabled={!canManage} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Fin</label>
            <Input name="endsAt" type="datetime-local" step={3600} defaultValue={endsAt} disabled={!canManage} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Bonos asociados</label>
            <Input
              value={passSearch}
              onChange={(event) => setPassSearch(event.target.value)}
              placeholder="Buscar por titular o nombre del bono"
              disabled={!eligiblePasses.length}
            />
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-border/80 bg-surface-alt/40 p-3">
              {visiblePasses.length ? (
                visiblePasses.map((pass) => {
                  const checked = selectedPassIds.includes(pass.id)
                  return (
                    <label key={pass.id} className="flex items-start gap-3 rounded-xl bg-surface px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name="passIds"
                        value={pass.id}
                        checked={checked}
                        disabled={!canManage}
                        className="mt-1"
                        onChange={(event) => {
                          setSelectedPassIds((current) =>
                            event.target.checked
                              ? Array.from(new Set([...current, pass.id]))
                              : current.filter((id) => id !== pass.id)
                          )
                        }}
                      />
                      <span>
                        <span className="block font-semibold text-text-primary">{getPassLabel(pass)}</span>
                        <span className="text-text-secondary">Titulares: {pass.holderNames.join(" / ")}</span>
                      </span>
                    </label>
                  )
                })
              ) : (
                <p className="rounded-xl bg-surface px-3 py-3 text-sm text-text-secondary">
                  No hay bonos que coincidan con la búsqueda.
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Clientes inferidos</label>
            <div className="rounded-2xl border border-border/80 bg-surface-alt/60 px-3.5 py-3 text-sm text-text-secondary">
              {clientNames.length ? clientNames.join(" / ") : "Selecciona uno o varios bonos para ver los clientes."}
            </div>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Notas</label>
            <textarea
              name="notes"
              defaultValue={editingSession?.notes ?? ""}
              disabled={!canManage}
              className="min-h-24 w-full rounded-xl border border-input bg-surface px-3.5 py-2 text-sm disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-text-muted"
            />
          </div>
          <div className="flex flex-col gap-3 md:col-span-2 md:flex-row md:items-center">
            {canManage ? (
              <div className="md:w-auto">
                <AuthFormSubmit
                  idleLabel={state.mode === "create" ? "Agendar sesión" : "Guardar cambios"}
                  pendingLabel="Guardando..."
                />
              </div>
            ) : null}
          </div>
        </form>
        {editingSession && canManage ? (
          <form
            action={deleteAction}
            className="mt-3"
            onSubmit={(event) => {
              if (!window.confirm("Vas a eliminar esta sesión de la agenda. ¿Quieres continuar?")) {
                event.preventDefault()
              }
            }}
          >
            <input type="hidden" name="sessionId" value={editingSession.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button type="submit" variant="outline" className="w-full gap-2 rounded-2xl md:w-auto">
              <Trash2 className="h-4 w-4" />
              Eliminar sesión
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  )
}

export function AgendaBoard({
  sessions,
  trainers,
  passes,
  currentProfile,
  view,
  selectedDate,
  selectedTrainerId
}: {
  sessions: CalendarSession[]
  trainers: TrainerOption[]
  passes: Pass[]
  currentProfile: Profile
  view: AgendaView
  selectedDate: string
  selectedTrainerId: string
}) {
  const baseDate = parseDateKey(selectedDate)
  const [selectedSlot, setSelectedSlot] = useState<AgendaSlot | null>(null)
  const [modalState, setModalState] = useState<ModalState>(null)
  const filteredSessions = useMemo(
    () => sessions
      .filter((session) => session.status !== "cancelled")
      .filter((session) => session.trainerProfileId === selectedTrainerId)
      .sort(compareAgendaSessions),
    [selectedTrainerId, sessions]
  )
  const selectedTrainer = trainers.find((trainer) => trainer.id === selectedTrainerId)
  const canManageSelectedTrainer = currentProfile.role === "admin" || selectedTrainerId === currentProfile.id
  const returnTo = buildAgendaUrl(view, selectedDate, selectedTrainerId)
  const previousDate = toDateKey(getNavigationDate(baseDate, view, -1))
  const nextDate = toDateKey(getNavigationDate(baseDate, view, 1))
  const today = getTodayDateKeyInAppTimeZone()

  function openCreate(slot: AgendaSlot) {
    setModalState({ mode: "create", slot })
  }

  function renderEvents(day: Date, hour?: number) {
    const items = filteredSessions.filter((session) => {
      if (hour === undefined) {
        return toDateKeyInAppTimeZone(session.startsAt) === toDateKey(day)
      }
      return sameHour(session.startsAt, day, hour)
    })

    return (
      <div className="space-y-1.5">
        {items.map((session) => (
          <AgendaEventButton key={session.id} session={session} onOpen={(item) => setModalState({ mode: "edit", session: item })} />
        ))}
      </div>
    )
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(baseDate), index))
  const monthDays = buildMonthDays(baseDate)
  const daysForTimeGrid = view === "day" ? [baseDate] : weekDays

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-[1.1rem]">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/80 bg-surface px-3 py-2">
          <Button asChild variant={view === "day" ? "default" : "ghost"} size="sm" className="gap-2 rounded-lg">
            <Link href={buildAgendaUrl("day", selectedDate, selectedTrainerId)}>
              <Clock className="h-4 w-4" />
              Día
            </Link>
          </Button>
          <Button asChild variant={view === "week" ? "default" : "ghost"} size="sm" className="gap-2 rounded-lg">
            <Link href={buildAgendaUrl("week", selectedDate, selectedTrainerId)}>
              <CalendarDays className="h-4 w-4" />
              Semana
            </Link>
          </Button>
          <Button asChild variant={view === "month" ? "default" : "ghost"} size="sm" className="gap-2 rounded-lg">
            <Link href={buildAgendaUrl("month", selectedDate, selectedTrainerId)}>
              <CalendarDays className="h-4 w-4" />
              Mes
            </Link>
          </Button>
          <div className="h-7 w-px bg-border/80" />
          <form className="flex items-center gap-2" action="/agenda">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="day" value={selectedDate} />
            <ListFilter className="h-4 w-4 text-text-muted" />
            <select
              name="trainer"
              defaultValue={selectedTrainerId}
              className={cn(nativeSelectClassName, "h-9 rounded-lg bg-surface py-0 sm:h-9")}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              {trainers.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>
                  {trainer.fullName}
                </option>
              ))}
            </select>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-border/80 bg-surface-alt/55 px-3 py-2.5">
          <Button asChild variant="outline" size="sm" className="gap-2 rounded-lg">
            <Link href={buildAgendaUrl(view, today, selectedTrainerId)}>
              <CalendarDays className="h-4 w-4" />
              Hoy
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href={buildAgendaUrl(view, previousDate, selectedTrainerId)}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href={buildAgendaUrl(view, nextDate, selectedTrainerId)}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <h3 className="font-heading text-xl font-bold capitalize text-text-primary">
            {formatHeadingDate(baseDate, view)}
          </h3>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selectedTrainer ? (
              <span className="rounded-full px-3 py-1 text-sm font-semibold text-slate-900" style={{ backgroundColor: selectedTrainer.calendarColor }}>
                {selectedTrainer.fullName}
              </span>
            ) : null}
            <Button
              type="button"
              className="gap-2 rounded-lg"
              size="sm"
              disabled={!selectedSlot || !canManageSelectedTrainer}
              onClick={() => selectedSlot ? openCreate(selectedSlot) : null}
            >
              <Plus className="h-4 w-4" />
              Agendar sesión
            </Button>
          </div>
        </div>

        {view === "month" ? (
          <div>
            <div className="grid grid-cols-7 border-b border-border/80 text-xs font-semibold text-text-secondary">
              {weekDayLabels.map((label) => (
                <div key={label} className="border-r border-border/70 px-2 py-2 last:border-r-0">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 bg-border/70">
              {monthDays.map((day) => {
                const isCurrentMonth = day.getMonth() === baseDate.getMonth()
                const isSelected = selectedSlot?.startsAt.slice(0, 10) === toDateKey(day)
                return (
                  <div key={toDateKey(day)} className="min-h-32 bg-surface p-2">
                    <button
                      type="button"
                      disabled={!canManageSelectedTrainer}
                      onClick={() => setSelectedSlot(makeSlot(day, 9))}
                      className={cn(
                        "mb-2 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                        isSelected ? "bg-primary text-white" : "text-text-secondary hover:bg-surface-alt",
                        !isCurrentMonth && "opacity-45"
                      )}
                    >
                      {day.getDate()}
                    </button>
                    {renderEvents(day)}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[860px]"
              style={{ gridTemplateColumns: `4rem repeat(${daysForTimeGrid.length}, minmax(0, 1fr))` }}
            >
              <div className="border-b border-r border-border/80 bg-surface-alt/60" />
              {daysForTimeGrid.map((day, index) => (
                <div key={toDateKey(day)} className="border-b border-r border-border/80 bg-surface-alt/60 px-3 py-3 last:border-r-0">
                  <p className="font-heading text-xl font-bold text-text-primary">{day.getDate()}</p>
                  <p className="text-xs text-text-secondary">{weekDayLabels[(day.getDay() + 6) % 7]}</p>
                  {view === "week" && index === (baseDate.getDay() + 6) % 7 ? (
                    <div className="mt-2 h-0.5 bg-red-500" />
                  ) : null}
                </div>
              ))}
              {hours.map((hour) => (
                <div key={hour} className="contents">
                  <div className="border-r border-border/80 bg-surface px-2 py-2 text-right text-xs text-text-secondary">
                    {pad(hour)}
                  </div>
                  {daysForTimeGrid.map((day) => {
                    const slot = makeSlot(day, hour)
                    const isSelected = selectedSlot?.startsAt === slot.startsAt
                    return (
                      <div key={`${toDateKey(day)}-${hour}`} className="min-h-[4.75rem] border-r border-t border-border/70 bg-surface p-1.5 last:border-r-0">
                        <button
                          type="button"
                          disabled={!canManageSelectedTrainer}
                          onClick={() => setSelectedSlot(slot)}
                          className={cn(
                            "mb-1 h-5 w-full rounded border border-dashed text-[11px] transition",
                            isSelected
                              ? "border-primary bg-primary-soft text-primary-hover"
                              : "border-transparent hover:border-border hover:bg-surface-alt",
                            !canManageSelectedTrainer && "cursor-not-allowed opacity-40"
                          )}
                        >
                          {isSelected ? "Seleccionado" : ""}
                        </button>
                        {renderEvents(day, hour)}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {!canManageSelectedTrainer ? (
        <p className="rounded-2xl border border-border/80 bg-surface-alt/70 px-4 py-3 text-sm text-text-secondary">
          Puedes consultar esta agenda, pero solo un administrador puede crear, editar o eliminar citas de otro entrenador.
        </p>
      ) : null}

      <AgendaModal
        state={modalState}
        currentProfile={currentProfile}
        trainers={trainers}
        passes={passes}
        selectedTrainerId={selectedTrainerId}
        returnTo={returnTo}
        canManageSelectedTrainer={canManageSelectedTrainer}
        onClose={() => setModalState(null)}
      />
    </div>
  )
}
