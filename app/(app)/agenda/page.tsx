import { PageHeader } from "@/components/page-header"
import { AgendaBoard } from "@/features/calendar/agenda-board"
import { getCalendarSessions, getPasses, getTrainerProfiles } from "@/lib/data"
import { requireAuthenticatedProfile } from "@/lib/auth/session"
import { getTodayDateKeyInAppTimeZone } from "@/lib/timezone"

type AgendaView = "day" | "week" | "month"

function parseParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}

function parseView(value?: string): AgendaView {
  if (value === "week" || value === "month") {
    return value
  }

  return "day"
}

export default async function AgendaPage({
  searchParams
}: {
  searchParams?:
    | Promise<{ view?: string | string[]; day?: string | string[]; trainer?: string | string[] }>
    | { view?: string | string[]; day?: string | string[]; trainer?: string | string[] }
}) {
  const { profile } = await requireAuthenticatedProfile()
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const [sessions, trainers, passes] = await Promise.all([
    getCalendarSessions(),
    getTrainerProfiles(),
    getPasses()
  ])

  if (!profile) {
    return null
  }

  const view = parseView(parseParam(resolvedSearchParams?.view))
  const selectedDate = parseParam(resolvedSearchParams?.day) ?? getTodayDateKeyInAppTimeZone()
  const requestedTrainerId = parseParam(resolvedSearchParams?.trainer)
  const trainerIds = new Set(trainers.map((trainer) => trainer.id))
  const selectedTrainerId = requestedTrainerId && trainerIds.has(requestedTrainerId)
    ? requestedTrainerId
    : trainerIds.has(profile.id)
      ? profile.id
      : trainers[0]?.id ?? profile.id

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description="Programa sesiones por entrenador, dia, semana o mes con vista operativa tipo calendario."
      />
      <AgendaBoard
        key={`${view}-${selectedDate}-${selectedTrainerId}`}
        sessions={sessions}
        trainers={trainers}
        passes={passes}
        currentProfile={profile}
        view={view}
        selectedDate={selectedDate}
        selectedTrainerId={selectedTrainerId}
      />
    </div>
  )
}
