import type { ClientMaxWeightEntry, StrengthMetric } from "@/types/domain"

export type ClientMaxWeightSummary = {
  metric: StrengthMetric
  latestEntry: ClientMaxWeightEntry | null
  previousEntry: ClientMaxWeightEntry | null
  changeKg: number | null
}

export type ClientMaxWeightMetricStats = {
  latestEntry: ClientMaxWeightEntry | null
  previousEntry: ClientMaxWeightEntry | null
  earliestEntry: ClientMaxWeightEntry | null
  bestEntry: ClientMaxWeightEntry | null
  changeKg: number | null
  totalProgressKg: number | null
}

export function roundKg(value: number) {
  return Math.round(value * 10) / 10
}

export function compareMaxWeightEntriesAsc(left: ClientMaxWeightEntry, right: ClientMaxWeightEntry) {
  return `${left.entryDate}|${left.createdAt}|${left.id}`.localeCompare(`${right.entryDate}|${right.createdAt}|${right.id}`)
}

export function compareMaxWeightEntriesDesc(left: ClientMaxWeightEntry, right: ClientMaxWeightEntry) {
  return -compareMaxWeightEntriesAsc(left, right)
}

export function sortStrengthMetrics(left: StrengthMetric, right: StrengthMetric) {
  if (left.isActive !== right.isActive) {
    return left.isActive ? -1 : 1
  }

  return left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "es")
}

export function formatKg(value: number) {
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1
  }).format(value)
}

export function formatKgWithUnit(value: number) {
  return `${formatKg(value)} kg`
}

export function formatWeightChange(value: number | null) {
  if (value === null) {
    return "Sin comparativa"
  }

  if (value === 0) {
    return "Sin cambios"
  }

  return `${value > 0 ? "+" : ""}${formatKg(value)} kg`
}

export function formatEntryMonth(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    timeZone: process.env.APP_TIMEZONE ?? "Europe/Madrid"
  }).format(new Date(value))
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    timeZone: process.env.APP_TIMEZONE ?? "Europe/Madrid"
  }).format(new Date(value))
}

export function formatChangeSincePrevious(changeKg: number | null, previousEntry: ClientMaxWeightEntry | null) {
  if (changeKg === null || !previousEntry) {
    return "Sin comparativa"
  }

  if (changeKg === 0) {
    return "Sin cambios"
  }

  return `${formatWeightChange(changeKg)} desde ${formatEntryMonth(previousEntry.entryDate)}`
}

export function getMaxWeightStats(entries: ClientMaxWeightEntry[]): ClientMaxWeightMetricStats {
  const sortedAsc = [...entries].sort(compareMaxWeightEntriesAsc)
  const latestEntry = sortedAsc[sortedAsc.length - 1] ?? null
  const previousEntry = sortedAsc[sortedAsc.length - 2] ?? null
  const earliestEntry = sortedAsc[0] ?? null
  const bestEntry = sortedAsc.reduce<ClientMaxWeightEntry | null>(
    (best, entry) => !best || entry.valueKg > best.valueKg ? entry : best,
    null
  )

  return {
    latestEntry,
    previousEntry,
    earliestEntry,
    bestEntry,
    changeKg: latestEntry && previousEntry
      ? roundKg(latestEntry.valueKg - previousEntry.valueKg)
      : null,
    totalProgressKg: latestEntry && earliestEntry
      ? roundKg(latestEntry.valueKg - earliestEntry.valueKg)
      : null
  }
}

export function getMetricsWithEntries(metrics: StrengthMetric[], entries: ClientMaxWeightEntry[]) {
  const metricIdsWithEntries = new Set(entries.map((entry) => entry.metricId))

  return metrics
    .filter((metric) => metricIdsWithEntries.has(metric.id))
    .sort(sortStrengthMetrics)
}

export function buildClientMaxWeightSummary({
  metrics,
  entries
}: {
  metrics: StrengthMetric[]
  entries: ClientMaxWeightEntry[]
}): ClientMaxWeightSummary[] {
  return metrics
    .filter((metric) => metric.isActive)
    .map((metric) => {
      const metricEntries = entries
        .filter((entry) => entry.metricId === metric.id)
      const stats = getMaxWeightStats(metricEntries)

      return {
        metric,
        latestEntry: stats.latestEntry,
        previousEntry: stats.previousEntry,
        changeKg: stats.changeKg
      }
    })
}

export function getEntriesForMetric(
  entries: ClientMaxWeightEntry[],
  metricId: string,
  order: "asc" | "desc" = "desc"
) {
  return entries
    .filter((entry) => entry.metricId === metricId)
    .sort(order === "asc" ? compareMaxWeightEntriesAsc : compareMaxWeightEntriesDesc)
}
