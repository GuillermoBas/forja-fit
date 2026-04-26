import { addDays, endOfMonth } from "date-fns"
import { AgendaCalendar } from "@/features/client-portal/agenda-calendar"
import { getClientCalendarSessions, getPortalDashboardData } from "@/features/client-portal/data"
import { PortalShell } from "@/features/client-portal/portal-shell"

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

export default async function ClientPortalAgendaPage({
  searchParams
}: {
  searchParams?:
    | Promise<{ view?: string | string[]; day?: string | string[] }>
    | { view?: string | string[]; day?: string | string[] }
}) {
  const data = await getPortalDashboardData()
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const view = parseView(parseParam(resolvedSearchParams?.view))
  const selectedDate = parseParam(resolvedSearchParams?.day) ?? new Date().toISOString().slice(0, 10)
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
    <PortalShell
      title="Agenda"
      description="Consulta tus sesiones por semana o mes y cancela solo con mas de 24 horas de antelacion."
      clientName={data.client.fullName}
      currentPath="/cliente/agenda"
    >
      <AgendaCalendar
        sessions={sessions}
        view={view}
        selectedDate={toDateKey(baseDate)}
      />
    </PortalShell>
  )
}
