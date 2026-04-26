import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  max,
  min,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths
} from "date-fns"
import { getCurrentPortalAccessToken, requirePortalAccount } from "@/lib/auth/portal-session"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import type { Client, Pass } from "@/types/domain"

type DbRow = Record<string, unknown>

export type PortalActivityRange = 30 | 90 | 180 | 365

export type PortalKpis = {
  sessionsLast30Days: number
  currentStreakWeeks: number
  monthlyConsistency: {
    activeWeeks: number
    elapsedWeeks: number
    ratio: number
  }
  sessionsRemaining: number
  daysUntilNearestExpiry: number | null
  monthOverMonthDelta: number
}

export type PortalChartPoint = {
  label: string
  value: number
}

export type PortalHistoricalItem = {
  id: string
  kind: "session" | "pause" | "renewal"
  happenedAt: string
  title: string
  detail: string
}

export type PortalPassSummary = {
  id: string
  passTypeName: string
  passKind: Pass["passKind"]
  status: Pass["status"]
  expiresOn: string
  sessionsLeft: number | null
  holderSummary: string
}

export type PortalDashboardData = {
  client: Client
  rangeDays: PortalActivityRange
  availableRanges: PortalActivityRange[]
  kpis: PortalKpis
  chart: PortalChartPoint[]
  history: PortalHistoricalItem[]
  activePasses: PortalPassSummary[]
}

type SessionItem = {
  id: string
  passId: string
  consumedAt: string
  notes: string | null
}

type PauseItem = {
  id: string
  passId: string
  createdAt: string
  startsOn: string
  endsOn: string
}

type NotificationItem = {
  id: string
  createdAt: string
  body: string | null
}

function parseRange(value?: string): PortalActivityRange {
  const parsed = Number(value)

  if (parsed === 90 || parsed === 180 || parsed === 365) {
    return parsed
  }

  return 30
}

function startOfMadridWeek(date: Date) {
  return startOfWeek(date, { weekStartsOn: 1 })
}

function endOfMadridWeek(date: Date) {
  return endOfWeek(date, { weekStartsOn: 1 })
}

function getWeekKey(date: Date) {
  return format(startOfMadridWeek(date), "yyyy-MM-dd")
}

function buildHolderSummary(pass: Pass, clientId: string) {
  if (pass.holderClientIds.length <= 1) {
    return "Titular unico"
  }

  const hasOtherHolder = pass.holderClientIds.some((holderId) => holderId !== clientId)

  if (!hasOtherHolder) {
    return "Titular unico"
  }

  return "Compartido con Otro titular"
}

function mapPortalClient(row: DbRow): Client {
  const firstName = String(row.first_name ?? "").trim()
  const lastName = String(row.last_name ?? "").trim()

  return {
    id: String(row.id),
    fullName: [firstName, lastName].filter(Boolean).join(" "),
    firstName,
    lastName,
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    notes: row.notes ? String(row.notes) : null,
    isActive: Boolean(row.is_active)
  }
}

function mapPortalPass(row: DbRow, passTypeName: string, holderIds: string[], holderNames: string[]): Pass {
  return {
    id: String(row.id),
    passTypeId: String(row.pass_type_id),
    passTypeName,
    passKind: String(row.pass_kind ?? "session") as Pass["passKind"],
    holderClientIds: holderIds,
    holderNames,
    purchasedByClientId: row.purchased_by_client_id ? String(row.purchased_by_client_id) : null,
    purchasedByName: null,
    contractedOn: String(row.contracted_on ?? ""),
    soldPriceGross: Number(row.sold_price_gross ?? 0),
    originalSessions: row.original_sessions === null || row.original_sessions === undefined
      ? null
      : Number(row.original_sessions),
    sessionsLeft: row.sessions_left === null || row.sessions_left === undefined
      ? null
      : Number(row.sessions_left),
    expiresOn: String(row.expires_on ?? ""),
    status: String(row.status ?? "active") as Pass["status"],
    notes: row.notes ? String(row.notes) : null
  }
}

function calculateCurrentStreakWeeks(sessions: SessionItem[], today: Date) {
  const activeWeekKeys = new Set(sessions.map((item) => getWeekKey(parseISO(item.consumedAt))))
  let streak = 0
  let cursor = startOfMadridWeek(today)

  while (activeWeekKeys.has(format(cursor, "yyyy-MM-dd"))) {
    streak += 1
    cursor = subDays(cursor, 7)
  }

  return streak
}

function calculateMonthlyConsistency(sessions: SessionItem[], today: Date) {
  const monthStart = startOfMonth(today)
  const sessionWeekKeys = new Set(
    sessions
      .map((item) => parseISO(item.consumedAt))
      .filter((date) => date >= monthStart && date <= today)
      .map((date) => getWeekKey(date))
  )

  let elapsedWeeks = 0
  let cursor = startOfMadridWeek(monthStart)

  while (cursor <= today) {
    elapsedWeeks += 1
    cursor = addDays(cursor, 7)
  }

  const activeWeeks = sessionWeekKeys.size

  return {
    activeWeeks,
    elapsedWeeks: Math.max(elapsedWeeks, 1),
    ratio: activeWeeks / Math.max(elapsedWeeks, 1)
  }
}

function calculateMonthOverMonthDelta(sessions: SessionItem[], today: Date) {
  const currentMonthStart = startOfMonth(today)
  const elapsedDays = differenceInCalendarDays(today, currentMonthStart) + 1
  const previousMonthStart = startOfMonth(subMonths(today, 1))
  const previousMonthEnd = endOfMonth(previousMonthStart)
  const comparablePreviousEnd = min([previousMonthEnd, addDays(previousMonthStart, elapsedDays - 1)])

  const currentMonthCount = sessions.filter((item) => {
    const date = parseISO(item.consumedAt)
    return date >= currentMonthStart && date <= today
  }).length

  const previousMonthCount = sessions.filter((item) => {
    const date = parseISO(item.consumedAt)
    return date >= previousMonthStart && date <= comparablePreviousEnd
  }).length

  return currentMonthCount - previousMonthCount
}

function buildChartPoints(sessions: SessionItem[], rangeDays: PortalActivityRange, today: Date) {
  const rangeStart = startOfDay(subDays(today, rangeDays - 1))
  const buckets = new Map<string, number>()
  let cursor = startOfMadridWeek(rangeStart)
  const rangeEnd = endOfMadridWeek(today)

  while (cursor <= rangeEnd) {
    const key = format(cursor, "yyyy-MM-dd")
    buckets.set(key, 0)
    cursor = addDays(cursor, 7)
  }

  for (const session of sessions) {
    const sessionDate = parseISO(session.consumedAt)
    if (sessionDate < rangeStart || sessionDate > today) {
      continue
    }

    const key = getWeekKey(sessionDate)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  return Array.from(buckets.entries()).map(([key, value]) => {
    const weekStart = parseISO(key)
    const weekEnd = min([endOfMadridWeek(weekStart), today])

    return {
      label: `${format(weekStart, "d MMM")} - ${format(weekEnd, "d MMM")}`,
      value
    }
  })
}

function buildHistory(
  sessions: SessionItem[],
  pauses: PauseItem[],
  renewals: NotificationItem[],
  rangeDays: PortalActivityRange,
  today: Date
) {
  const rangeStart = startOfDay(subDays(today, rangeDays - 1))
  const history: PortalHistoricalItem[] = []

  for (const session of sessions) {
    const date = parseISO(session.consumedAt)
    if (date < rangeStart || date > today) {
      continue
    }

    history.push({
      id: `session-${session.id}`,
      kind: "session",
      happenedAt: session.consumedAt,
      title: "Sesion consumida",
      detail: session.notes ?? "Entrenamiento registrado en tu bono."
    })
  }

  for (const pause of pauses) {
    const date = parseISO(pause.createdAt)
    if (date < rangeStart || date > today) {
      continue
    }

    history.push({
      id: `pause-${pause.id}`,
      kind: "pause",
      happenedAt: pause.createdAt,
      title: "Bono pausado",
      detail: `${pause.startsOn} a ${pause.endsOn}`
    })
  }

  for (const renewal of renewals) {
    const date = parseISO(renewal.createdAt)
    if (date < rangeStart || date > today) {
      continue
    }

    history.push({
      id: `renewal-${renewal.id}`,
      kind: "renewal",
      happenedAt: renewal.createdAt,
      title: "Renovacion registrada",
      detail: renewal.body ?? "Se ha renovado uno de tus bonos."
    })
  }

  return history.sort((left, right) => right.happenedAt.localeCompare(left.happenedAt))
}

export async function getPortalDashboardData(rangeParam?: string): Promise<PortalDashboardData> {
  const portalAccount = await requirePortalAccount()
  const accessToken = await getCurrentPortalAccessToken()

  if (!accessToken) {
    throw new Error("No se ha podido recuperar la sesion del portal.")
  }

  const rangeDays = parseRange(rangeParam)
  const client = createServerInsforgeClient({ accessToken }) as any

  const [clientResult, holdersResult, passesResult, passTypesResult, sessionsResult, pausesResult, renewalsResult] =
    await Promise.all([
      client.database.from("clients").select("*").eq("id", portalAccount.clientId).maybeSingle(),
      client.database.from("pass_holders").select("*").eq("client_id", portalAccount.clientId),
      client.database.from("passes").select("*").order("expires_on", { ascending: true }),
      client.database.from("pass_types").select("*"),
      client.database.from("session_consumptions").select("*").order("consumed_at", { ascending: false }),
      client.database.from("pass_pauses").select("*").order("created_at", { ascending: false }),
      client.database
        .from("notification_log")
        .select("id,created_at,body,event_type")
        .eq("client_id", portalAccount.clientId)
        .eq("event_type", "renewal_confirmation")
        .order("created_at", { ascending: false })
    ])

  if (
    clientResult.error ||
    !clientResult.data ||
    holdersResult.error ||
    !holdersResult.data ||
    passesResult.error ||
    !passesResult.data ||
    passTypesResult.error ||
    !passTypesResult.data ||
    sessionsResult.error ||
    !sessionsResult.data ||
    pausesResult.error ||
    !pausesResult.data ||
    renewalsResult.error ||
    !renewalsResult.data
  ) {
    throw new Error("No se pudieron cargar los datos del portal.")
  }

  const portalClient = mapPortalClient(clientResult.data as DbRow)
  const allPassTypes = new Map(
    (passTypesResult.data as DbRow[]).map((row) => [String(row.id), String(row.name ?? "Bono")])
  )

  const passIds = (holdersResult.data as DbRow[]).map((row) => String(row.pass_id))
  const relevantPasses = (passesResult.data as DbRow[])
    .filter((row) => passIds.includes(String(row.id)))

  const holderRows = await client.database
    .from("pass_holders")
    .select("*")
    .in("pass_id", relevantPasses.map((row) => String(row.id)))
    .order("holder_order", { ascending: true })

  if (holderRows.error || !holderRows.data) {
    throw new Error("No se pudieron cargar los titulares de los bonos.")
  }

  const holderClientIds = Array.from(
    new Set((holderRows.data as DbRow[]).map((row) => String(row.client_id)))
  )

  const holderClientsResult = holderClientIds.length
    ? await client.database.from("clients").select("id,first_name,last_name").in("id", holderClientIds)
    : { data: [], error: null }

  if (holderClientsResult.error || !holderClientsResult.data) {
    throw new Error("No se pudieron cargar los datos de titulares.")
  }

  const holderNamesMap = new Map(
    (holderClientsResult.data as DbRow[]).map((row) => [
      String(row.id),
      `${String(row.first_name ?? "")} ${String(row.last_name ?? "")}`.trim()
    ])
  )

  const holdersByPass = new Map<string, string[]>()
  for (const row of holderRows.data as DbRow[]) {
    const passId = String(row.pass_id)
    const existing = holdersByPass.get(passId) ?? []
    existing.push(String(row.client_id))
    holdersByPass.set(passId, existing)
  }

  const passTypeKindMap = new Map(
    (passTypesResult.data as DbRow[]).map((row) => [
      String(row.id),
      String(row.kind ?? "session") as Pass["passKind"]
    ])
  )

  const passes = relevantPasses.map((row) =>
    mapPortalPass(
      {
        ...row,
        pass_kind: passTypeKindMap.get(String(row.pass_type_id)) ?? "session"
      },
      allPassTypes.get(String(row.pass_type_id)) ?? "Bono",
      holdersByPass.get(String(row.id)) ?? [],
      (holdersByPass.get(String(row.id)) ?? []).map((holderId) => holderNamesMap.get(holderId) ?? "Cliente")
    )
  )

  const sessions = (sessionsResult.data as DbRow[])
    .filter((row) => passIds.includes(String(row.pass_id)))
    .map((row) => ({
      id: String(row.id),
      passId: String(row.pass_id),
      consumedAt: String(row.consumed_at ?? row.created_at ?? ""),
      notes: row.notes ? String(row.notes) : null
    }))

  const pauses = (pausesResult.data as DbRow[])
    .filter((row) => passIds.includes(String(row.pass_id)))
    .map((row) => ({
      id: String(row.id),
      passId: String(row.pass_id),
      createdAt: String(row.created_at ?? ""),
      startsOn: String(row.starts_on ?? ""),
      endsOn: String(row.ends_on ?? "")
    }))

  const renewals = (renewalsResult.data as DbRow[]).map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at ?? ""),
    body: row.body ? String(row.body) : null
  }))

  const today = new Date()
  const last30Start = startOfDay(subDays(today, 29))
  const sessionsLast30Days = sessions.filter((item) => {
    const date = parseISO(item.consumedAt)
    return date >= last30Start && date <= today
  }).length

  const activePasses = passes
    .filter((pass) => pass.status === "active" || pass.status === "paused" || pass.status === "out_of_sessions")
    .sort((left, right) => left.expiresOn.localeCompare(right.expiresOn))
    .map((pass) => ({
      id: pass.id,
      passTypeName: pass.passTypeName,
      passKind: pass.passKind,
      status: pass.status,
      expiresOn: pass.expiresOn,
      sessionsLeft: pass.sessionsLeft,
      holderSummary: buildHolderSummary(pass, portalAccount.clientId)
    }))

  const sessionsRemaining = activePasses.reduce((sum, pass) => {
    if (pass.passKind !== "session") {
      return sum
    }

    return sum + Math.max(pass.sessionsLeft ?? 0, 0)
  }, 0)

  const futureExpiries = activePasses
    .map((pass) => parseISO(pass.expiresOn))
    .filter((date) => date >= startOfDay(today))

  const nearestExpiry = futureExpiries.length ? min(futureExpiries) : null
  const daysUntilNearestExpiry = nearestExpiry
    ? differenceInCalendarDays(nearestExpiry, startOfDay(today))
    : null

  return {
    client: portalClient,
    rangeDays,
    availableRanges: [30, 90, 180, 365],
    kpis: {
      sessionsLast30Days,
      currentStreakWeeks: calculateCurrentStreakWeeks(sessions, today),
      monthlyConsistency: calculateMonthlyConsistency(sessions, today),
      sessionsRemaining,
      daysUntilNearestExpiry,
      monthOverMonthDelta: calculateMonthOverMonthDelta(sessions, today)
    },
    chart: buildChartPoints(sessions, rangeDays, today),
    history: buildHistory(sessions, pauses, renewals, rangeDays, today),
    activePasses
  }
}
