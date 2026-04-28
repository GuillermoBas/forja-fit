import { Suspense } from "react"
import { addDays, endOfMonth } from "date-fns"
import { CalendarSkeleton } from "@/components/skeletons"
import { AgendaCalendar } from "@/features/client-portal/agenda-calendar"
import { PortalShellMeta } from "@/features/client-portal/persistent-shell"
import { getClientCalendarSessions, getPortalShellData } from "@/features/client-portal/data"

type AgendaView = "week" | "month"

function parseParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

function parseView(value?: string): AgendaView {
  return value === "month" ? "month" : "week"
}

function parseDateKey(value: string) {
  return new Date(`${value}T00:00:00`)
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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

async function AgendaData({
  view,
  selectedDate
}: {
  view: AgendaView
  selectedDate: string
}) {
  const baseDate = parseDateKey(selectedDate)
  const rangeStart =
    view === "month"
      ? startOfWeek(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1))
      : startOfWeek(baseDate)
  const rangeEnd =
    view === "month"
      ? endOfWeek(endOfMonth(baseDate))
      : endOfWeek(addDays(rangeStart, 0))
  const sessions = await getClientCalendarSessions(
    rangeStart.toISOString(),
    rangeEnd.toISOString()
  )

  return (
    <AgendaCalendar
      sessions={sessions}
      view={view}
      selectedDate={toDateKey(baseDate)}
    />
  )
}

async function PortalIdentity() {
  const shellData = await getPortalShellData()

  return <PortalShellMeta clientName={shellData.client.fullName} />
}

export default async function ClientPortalAgendaPage({
  searchParams
}: {
  searchParams?:
    | Promise<{ view?: string | string[]; day?: string | string[] }>
    | { view?: string | string[]; day?: string | string[] }
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const view = parseView(parseParam(resolvedSearchParams?.view))
  const selectedDate = parseParam(resolvedSearchParams?.day) ?? new Date().toISOString().slice(0, 10)

  return (
    <>
      <Suspense fallback={null}>
        <PortalIdentity />
      </Suspense>
      <Suspense fallback={<CalendarSkeleton />}>
        <AgendaData view={view} selectedDate={selectedDate} />
      </Suspense>
    </>
  )
}
