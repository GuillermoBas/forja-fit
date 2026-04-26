import { ChevronLeft, ChevronRight } from "lucide-react"

const weekDays = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"]
const timeZone = "Europe/Madrid"

type CalendarDay = {
  key: string
  label: string
  isCurrentMonth: boolean
  isToday: boolean
}

function getMadridDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(date)

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value)
  }
}

function getMonthName(year: number, month: number) {
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function getShortMonthName(year: number, month: number, day: number) {
  return new Intl.DateTimeFormat("es-ES", {
    month: "short",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function buildMonthDays(year: number, month: number, today: ReturnType<typeof getMadridDateParts>) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const previousMonthDays = new Date(Date.UTC(year, month - 1, 0)).getUTCDate()
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7

  return Array.from({ length: totalCells }, (_, index): CalendarDay => {
    const monthDay = index - mondayOffset + 1
    const isPreviousMonth = monthDay < 1
    const isNextMonth = monthDay > daysInMonth
    const displayDay = isPreviousMonth
      ? previousMonthDays + monthDay
      : isNextMonth
        ? monthDay - daysInMonth
        : monthDay
    const displayMonth = isPreviousMonth ? month - 1 : isNextMonth ? month + 1 : month
    const normalizedMonth = displayMonth < 1 ? 12 : displayMonth > 12 ? 1 : displayMonth
    const normalizedYear = displayMonth < 1 ? year - 1 : displayMonth > 12 ? year + 1 : year
    const isCurrentMonth = !isPreviousMonth && !isNextMonth
    const isToday = normalizedYear === today.year && normalizedMonth === today.month && displayDay === today.day
    const label = displayDay === 1 || isPreviousMonth || isNextMonth
      ? `${displayDay} ${getShortMonthName(normalizedYear, normalizedMonth, displayDay)}`
      : String(displayDay).padStart(2, "0")

    return {
      key: `${normalizedYear}-${normalizedMonth}-${displayDay}`,
      label,
      isCurrentMonth,
      isToday
    }
  })
}

export function AgendaCalendar() {
  const today = getMadridDateParts()
  const days = buildMonthDays(today.year, today.month, today)
  const monthName = getMonthName(today.year, today.month)

  return (
    <section className="w-full max-w-full overflow-hidden rounded-[1.2rem] border border-border/80 bg-surface">
      <div className="overflow-x-auto overscroll-x-contain">
        <div className="min-w-[42rem]">
          <div className="flex flex-wrap items-center gap-3 border-b border-border/80 bg-surface-alt/55 px-3 py-2.5 sm:px-4">
            <button
              type="button"
              className="rounded-md border border-border/80 bg-surface px-3 py-1.5 text-sm font-semibold text-text-primary shadow-sm"
            >
              Hoy
            </button>
            <div className="flex items-center gap-1 text-text-secondary" aria-hidden="true">
              <span className="flex h-8 w-8 items-center justify-center rounded-md">
                <ChevronLeft className="h-4 w-4" />
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-md">
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>
            <h3 className="font-heading text-xl font-bold capitalize text-text-primary">
              {monthName}
            </h3>
          </div>

          <div className="grid grid-cols-7 border-b border-border/80 bg-surface text-[11px] font-semibold text-text-secondary sm:text-xs">
            {weekDays.map((day) => (
              <div key={day} className="border-r border-border/80 px-2 py-2 last:border-r-0">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 bg-border/70">
            {days.map((day) => (
              <div
                key={day.key}
                className="min-h-[6.25rem] bg-surface p-1.5 sm:min-h-[8.5rem] sm:p-2"
              >
                <div
                  className={[
                    "flex h-full flex-col rounded-md border border-transparent p-1 text-xs sm:text-sm",
                    day.isToday ? "border-red-500" : "",
                    day.isCurrentMonth ? "text-text-primary" : "text-text-muted"
                  ].join(" ")}
                >
                  <span className={day.isToday ? "flex h-6 w-6 items-center justify-center rounded-full bg-red-500 font-semibold text-white" : ""}>
                    {day.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
