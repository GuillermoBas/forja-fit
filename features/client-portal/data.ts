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
import { cache } from "react"
import { requirePortalAccount } from "@/lib/auth/portal-session"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { isClientPreview } from "@/lib/preview-mode"
import { getTodayDateKeyInAppTimeZone } from "@/lib/timezone"
import { getEffectivePassStatus } from "@/lib/utils"
import {
  getPreviewClientCalendarSessions,
  getPreviewPortalMaxWeightHistory,
  getPreviewPortalMaxWeightLatest,
  getPreviewPortalDashboardData
} from "@/features/client-portal/preview-data"
import { requireCurrentGym } from "@/lib/tenant"
import type {
  CalendarStatus,
  Client,
  ClientMaxWeightEntry,
  Pass,
  StrengthMetric
} from "@/types/domain"

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

export type PortalMaxWeightData = {
  metrics: StrengthMetric[]
  entries: ClientMaxWeightEntry[]
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

export type PortalShellData = {
  client: Client
}

export type ClientCalendarSession = {
  id: string
  startsAt: string
  endsAt: string
  durationMin: number
  status: CalendarStatus
  trainerName: string | null
  isShared: boolean
  displayTitle: string
  canCancel: boolean
  cancellationReason: string | null
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
  eventType: string
  passId: string | null
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
  const pass = {
    id: String(row.id),
    passTypeId: String(row.pass_type_id),
    passTypeName,
    passKind: String(row.pass_kind ?? "session") as Pass["passKind"],
    passSubType: row.pass_sub_type ? String(row.pass_sub_type) as Pass["passSubType"] : null,
    holderClientIds: holderIds,
    holderNames,
    purchasedByClientId: row.purchased_by_client_id ? String(row.purchased_by_client_id) : null,
    purchasedByName: null,
    contractedOn: String(row.contracted_on ?? ""),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    pauseStartsOn: row.pause_starts_on ? String(row.pause_starts_on) : null,
    pauseEndsOn: row.pause_ends_on ? String(row.pause_ends_on) : null,
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
  } satisfies Pass

  return {
    ...pass,
    status: getEffectivePassStatus(pass, getTodayDateKeyInAppTimeZone())
  }
}

function mapPortalStrengthMetric(row: DbRow): StrengthMetric {
  return {
    id: String(row.id),
    gymId: String(row.gym_id ?? ""),
    name: String(row.name ?? ""),
    unit: String(row.unit ?? "kg"),
    displayOrder: Number(row.display_order ?? 0),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  }
}

function mapPortalMaxWeightEntry(row: DbRow, metricById: Map<string, StrengthMetric>): ClientMaxWeightEntry {
  const metricId = String(row.metric_id ?? "")
  const metric = metricById.get(metricId)

  return {
    id: String(row.id),
    gymId: String(row.gym_id ?? ""),
    clientId: String(row.client_id ?? ""),
    metricId,
    metricName: metric?.name ?? "Metrica",
    unit: metric?.unit ?? "kg",
    valueKg: Number(row.value_kg ?? 0),
    entryDate: String(row.entry_date ?? ""),
    createdByProfileId: row.created_by_profile_id ? String(row.created_by_profile_id) : null,
    createdByName: null,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
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
      title: renewal.eventType === "pass_assigned" ? "Bono activado" : "Renovacion registrada",
      detail: renewal.body ?? (renewal.eventType === "pass_assigned" ? "Tienes un bono activo." : "Se ha renovado uno de tus bonos.")
    })
  }

  return history.sort((left, right) => right.happenedAt.localeCompare(left.happenedAt))
}

function getClientCalendarCancellationState(status: CalendarStatus, startsAt: string) {
  if (status !== "scheduled") {
    return {
      canCancel: false,
      cancellationReason:
        status === "cancelled"
          ? "Esta sesion ya esta cancelada."
          : "Esta sesion ya no permite cancelacion."
    }
  }

  const limit = Date.now() + 24 * 60 * 60 * 1000
  if (new Date(startsAt).getTime() <= limit) {
    return {
      canCancel: false,
      cancellationReason: "Solo puedes cancelar una sesion hasta 24 horas antes."
    }
  }

  return {
    canCancel: true,
    cancellationReason: null
  }
}

export const getPortalShellData = cache(async function getPortalShellData(): Promise<PortalShellData> {
  if (await isClientPreview()) {
    const preview = getPreviewPortalDashboardData()
    return { client: preview.client }
  }

  const portalAccount = await requirePortalAccount()
  const gym = await requireCurrentGym()

  const client = createServerInsforgeClient() as any
  const clientResult = await client.database
    .from("clients")
    .select("*")
    .eq("gym_id", gym.id)
    .eq("id", portalAccount.clientId)
    .maybeSingle()

  if (clientResult.error || !clientResult.data) {
    throw new Error("No se pudieron cargar los datos del portal.")
  }

  return {
    client: mapPortalClient(clientResult.data as DbRow)
  }
})

export const getPortalDashboardData = cache(async function getPortalDashboardData(rangeParam?: string): Promise<PortalDashboardData> {
  if (await isClientPreview()) {
    return getPreviewPortalDashboardData(rangeParam)
  }

  const portalAccount = await requirePortalAccount()

  const rangeDays = parseRange(rangeParam)
  const client = createServerInsforgeClient() as any
  const gym = await requireCurrentGym()

  const [clientResult, holdersResult, passesResult, passTypesResult, sessionsResult, pausesResult, renewalsResult] =
    await Promise.all([
      client.database.from("clients").select("*").eq("gym_id", gym.id).eq("id", portalAccount.clientId).maybeSingle(),
      client.database.from("pass_holders").select("*").eq("gym_id", gym.id).eq("client_id", portalAccount.clientId),
      client.database.from("passes").select("*").eq("gym_id", gym.id).order("expires_on", { ascending: true }),
      client.database.from("pass_types").select("*").eq("gym_id", gym.id),
      client.database.from("session_consumptions").select("*").eq("gym_id", gym.id).order("consumed_at", { ascending: false }),
      client.database.from("pass_pauses").select("*").eq("gym_id", gym.id).order("created_at", { ascending: false }),
      client.database
        .from("notification_log")
        .select("id,created_at,body,event_type,pass_id")
        .eq("gym_id", gym.id)
        .eq("client_id", portalAccount.clientId)
        .in("event_type", ["renewal_confirmation", "pass_assigned"])
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
    .eq("gym_id", gym.id)
    .in("pass_id", relevantPasses.map((row) => String(row.id)))
    .order("holder_order", { ascending: true })

  if (holderRows.error || !holderRows.data) {
    throw new Error("No se pudieron cargar los titulares de los bonos.")
  }

  const holderClientIds = Array.from(
    new Set((holderRows.data as DbRow[]).map((row) => String(row.client_id)))
  )

  const holderClientsResult = holderClientIds.length
    ? await client.database.from("clients").select("id,first_name,last_name").eq("gym_id", gym.id).in("id", holderClientIds)
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

  const latestPauseByPassId = new Map<string, { startsOn: string; endsOn: string }>()

  for (const row of pausesResult.data as DbRow[]) {
    const passId = String(row.pass_id ?? "")
    if (!passIds.includes(passId) || latestPauseByPassId.has(passId)) {
      continue
    }

    latestPauseByPassId.set(passId, {
      startsOn: String(row.starts_on ?? ""),
      endsOn: String(row.ends_on ?? "")
    })
  }

  const passes = relevantPasses.map((row) =>
    mapPortalPass(
      {
        ...row,
        pass_kind: passTypeKindMap.get(String(row.pass_type_id)) ?? "session",
        pause_starts_on: latestPauseByPassId.get(String(row.id))?.startsOn ?? null,
        pause_ends_on: latestPauseByPassId.get(String(row.id))?.endsOn ?? null
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
    body: row.body ? String(row.body) : null,
    eventType: String(row.event_type ?? ""),
    passId: row.pass_id ? String(row.pass_id) : null
  })).filter((row, index, rows) => {
    const key = `${row.eventType}:${row.passId ?? row.id}`
    return rows.findIndex((candidate) => `${candidate.eventType}:${candidate.passId ?? candidate.id}` === key) === index
  })

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
})

export const getPortalMaxWeightData = cache(async function getPortalMaxWeightData(): Promise<PortalMaxWeightData> {
  if (await isClientPreview()) {
    return {
      metrics: getPreviewPortalMaxWeightLatest().map((item) => item.metric),
      entries: getPreviewPortalMaxWeightLatest()
        .flatMap((item) => getPreviewPortalMaxWeightHistory(item.metric.id))
    }
  }

  const portalAccount = await requirePortalAccount()
  const gym = await requireCurrentGym()
  const client = createServerInsforgeClient() as any

  const [metricsResult, entriesResult] = await Promise.all([
    client.database
      .from("strength_metrics")
      .select("*")
      .eq("gym_id", gym.id)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
    client.database
      .from("client_max_weight_entries")
      .select("*")
      .eq("gym_id", gym.id)
      .eq("client_id", portalAccount.clientId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
  ])

  if (metricsResult.error || !metricsResult.data || entriesResult.error || !entriesResult.data) {
    throw new Error("No se pudieron cargar los maximos de fuerza del portal.")
  }

  const metrics = (metricsResult.data as DbRow[]).map(mapPortalStrengthMetric)
  const metricById = new Map(metrics.map((metric) => [metric.id, metric]))
  const entries = (entriesResult.data as DbRow[]).map((row) => mapPortalMaxWeightEntry(row, metricById))

  return {
    metrics,
    entries
  }
})

export const getClientCalendarSessions = cache(async function getClientCalendarSessions(
  rangeStart: string,
  rangeEnd: string
): Promise<ClientCalendarSession[]> {
  if (await isClientPreview()) {
    return getPreviewClientCalendarSessions().filter((session) => (
      session.startsAt >= rangeStart && session.startsAt <= rangeEnd
    ))
  }

  const portalAccount = await requirePortalAccount()
  const gym = await requireCurrentGym()

  const client = createServerInsforgeClient() as any
  const [sessionsResult, profilesResult] = await Promise.all([
    client.database
      .from("calendar_sessions")
      .select("id,trainer_profile_id,client_1_id,client_2_id,starts_at,ends_at,status")
      .eq("gym_id", gym.id)
      .or(`client_1_id.eq.${portalAccount.clientId},client_2_id.eq.${portalAccount.clientId}`)
      .gte("starts_at", rangeStart)
      .lte("starts_at", rangeEnd)
      .order("starts_at", { ascending: true }),
    client.database.from("profiles").select("id,full_name").eq("gym_id", gym.id)
  ])

  if (
    sessionsResult.error ||
    !sessionsResult.data ||
    profilesResult.error ||
    !profilesResult.data
  ) {
    throw new Error("No se pudo cargar la agenda del portal.")
  }

  const trainerNameById = new Map(
    (profilesResult.data as DbRow[]).map((row) => [String(row.id), String(row.full_name ?? "").trim()])
  )

  return (sessionsResult.data as DbRow[]).map((row) => {
    const startsAt = String(row.starts_at ?? "")
    const endsAt = String(row.ends_at ?? "")
    const client1Id = row.client_1_id ? String(row.client_1_id) : null
    const client2Id = row.client_2_id ? String(row.client_2_id) : null
    const isShared = [client1Id, client2Id].filter(Boolean).some(
      (clientId) => clientId !== portalAccount.clientId
    )
    const cancellationState = getClientCalendarCancellationState(
      String(row.status ?? "scheduled") as CalendarStatus,
      startsAt
    )

    return {
      id: String(row.id),
      startsAt,
      endsAt,
      durationMin: Math.max(
        0,
        Math.round(
          (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / (60 * 1000)
        )
      ),
      status: String(row.status ?? "scheduled") as CalendarStatus,
      trainerName: row.trainer_profile_id
        ? trainerNameById.get(String(row.trainer_profile_id)) ?? null
        : null,
      isShared,
      displayTitle: isShared ? "Sesion compartida" : "Sesion individual",
      canCancel: cancellationState.canCancel,
      cancellationReason: cancellationState.cancellationReason
    } satisfies ClientCalendarSession
  })
})
