import {
  demoCalendarSessions,
  demoClients,
  demoExpenses,
  demoNotifications,
  demoPassTypes,
  demoPasses,
  demoProducts,
  demoSales
} from "@/lib/demo-data"
import { isInsforgeConfigured } from "@/lib/config"
import { getAuthCookies } from "@/lib/auth/cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import type {
  CalendarSession,
  Client,
  ClientPortalAccountSummary,
  ClientPortalSupportState,
  Expense,
  NotificationLogItem,
  Pass,
  PassType,
  Product,
  Sale
} from "@/types/domain"

export type ClientHistoryItem = {
  id: string
  kind: "session" | "pause" | "renewal"
  happenedAt: string
  title: string
  detail: string
}

type DbRow = Record<string, unknown>

async function createAuthedClient() {
  if (!isInsforgeConfigured()) {
    return null
  }

  const { accessToken } = await getAuthCookies()
  if (!accessToken) {
    return null
  }

  try {
    return createServerInsforgeClient({ accessToken }) as any
  } catch {
    return null
  }
}

function mapClientRow(row: DbRow): Client {
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

function mapClientPortalAccountRow(row: DbRow): ClientPortalAccountSummary {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    authUserId: String(row.auth_user_id),
    email: String(row.email ?? ""),
    status: String(row.status ?? "claimed") as ClientPortalAccountSummary["status"],
    primaryProvider: String(row.primary_provider ?? "password") as ClientPortalAccountSummary["primaryProvider"],
    claimedAt: String(row.claimed_at ?? ""),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null
  }
}

function mapPassTypeRow(row: DbRow): PassType {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    kind: String(row.kind ?? "session") as PassType["kind"],
    sessionCount: row.sessions_total === null || row.sessions_total === undefined
      ? null
      : Number(row.sessions_total),
    price: Number(row.price_gross ?? 0),
    vatRate: Number(row.vat_rate ?? 0),
    sharedAllowed: Boolean(row.shared_allowed),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 0)
  }
}

function mapProductRow(row: DbRow): Product {
  const priceGross = Number(row.price_gross ?? 0)
  const stockOnHand = Number(row.stock_on_hand ?? 0)
  const minStock = Number(row.min_stock ?? 0)

  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    sku: row.sku ? String(row.sku) : null,
    category: row.category ? String(row.category) : null,
    price: priceGross,
    priceGross,
    vatRate: Number(row.vat_rate ?? 0),
    stock: stockOnHand,
    stockOnHand,
    lowStockThreshold: minStock,
    minStock,
    isActive: Boolean(row.is_active)
  }
}

function mapExpenseRow(row: DbRow): Expense {
  const totalAmount = Number(row.total_amount ?? 0)

  return {
    id: String(row.id),
    concept: String(row.note ?? row.supplier ?? row.category ?? ""),
    category: String(row.category ?? ""),
    supplier: row.supplier ? String(row.supplier) : null,
    paymentMethod: String(row.payment_method ?? "cash") as Expense["paymentMethod"],
    baseAmount: Number(row.base_amount ?? 0),
    vatAmount: Number(row.vat_amount ?? 0),
    amount: totalAmount,
    totalAmount,
    spentOn: String(row.spent_on ?? ""),
    note: row.note ? String(row.note) : null
  }
}

function mapNotificationRow(row: DbRow): NotificationLogItem {
  return {
    id: String(row.id),
    type: String(row.event_type ?? "manual_note") as NotificationLogItem["type"],
    channel: String(row.channel ?? "internal") as NotificationLogItem["channel"],
    status: String(row.status ?? "queued") as NotificationLogItem["status"],
    clientName: null,
    recipient: row.recipient ? String(row.recipient) : null,
    subject: row.subject ? String(row.subject) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    message: String(row.body ?? "")
  }
}

function mapCalendarRow(row: DbRow): CalendarSession {
  return {
    id: String(row.id),
    trainerProfileId: row.trainer_profile_id ? String(row.trainer_profile_id) : undefined,
    trainerName: String(row.trainer_name ?? "Entrenador"),
    trainerColor: String(row.trainer_color ?? "#BFDBFE"),
    client1Id: row.client_1_id ? String(row.client_1_id) : undefined,
    client2Id: row.client_2_id ? String(row.client_2_id) : null,
    clientNames: Array.isArray(row.client_names)
      ? (row.client_names as unknown[]).filter(Boolean).map(String)
      : [row.client_1_name, row.client_2_name].filter(Boolean).map(String),
    passId: row.pass_id ? String(row.pass_id) : null,
    passIds: Array.isArray(row.pass_ids) ? (row.pass_ids as unknown[]).map(String) : row.pass_id ? [String(row.pass_id)] : [],
    passLabels: Array.isArray(row.pass_labels) ? (row.pass_labels as unknown[]).filter(Boolean).map(String) : [],
    startsAt: String(row.starts_at ?? new Date().toISOString()),
    endsAt: String(row.ends_at ?? new Date().toISOString()),
    status: String(row.status ?? "scheduled") as CalendarSession["status"],
    notes: row.notes ? String(row.notes) : null
  }
}

async function getPassDataFromDb() {
  const client = await createAuthedClient()
  if (!client) {
    return null
  }

  const [passesResult, passTypesResult, clientsResult, holdersResult] = await Promise.all([
    client.database.from("passes").select("*").order("created_at", { ascending: false }),
    client.database.from("pass_types").select("*"),
    client.database.from("clients").select("*"),
    client.database.from("pass_holders").select("*").order("holder_order", { ascending: true })
  ])

  if (
    passesResult.error ||
    !passesResult.data ||
    passTypesResult.error ||
    !passTypesResult.data ||
    clientsResult.error ||
    !clientsResult.data ||
    holdersResult.error ||
    !holdersResult.data
  ) {
    return null
  }

  const clientMap = new Map(
    (clientsResult.data as DbRow[]).map((row) => [String(row.id), mapClientRow(row)])
  )
  const passTypeMap = new Map(
    (passTypesResult.data as DbRow[]).map((row) => [String(row.id), mapPassTypeRow(row)])
  )
  const holderMap = new Map<string, Array<{ clientId: string; holderOrder: number }>>()

  for (const row of holdersResult.data as DbRow[]) {
    const passId = String(row.pass_id ?? "")
    if (!passId) {
      continue
    }

    const existing = holderMap.get(passId) ?? []
    existing.push({
      clientId: String(row.client_id ?? ""),
      holderOrder: Number(row.holder_order ?? 0)
    })
    holderMap.set(passId, existing)
  }

  const passes = (passesResult.data as DbRow[]).map((row) => {
    const passType = passTypeMap.get(String(row.pass_type_id))
    const holders = (holderMap.get(String(row.id)) ?? [])
      .sort((left, right) => left.holderOrder - right.holderOrder)
      .map((holder) => holder.clientId)

    return {
      id: String(row.id),
      passTypeId: String(row.pass_type_id),
      passTypeName: passType?.name ?? "Bono",
      passKind: passType?.kind ?? "session",
      holderClientIds: holders,
      holderNames: holders.map((holderId) => clientMap.get(holderId)?.fullName ?? "Cliente"),
      purchasedByClientId: row.purchased_by_client_id ? String(row.purchased_by_client_id) : null,
      purchasedByName: row.purchased_by_client_id
        ? clientMap.get(String(row.purchased_by_client_id))?.fullName ?? null
        : null,
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
    } satisfies Pass
  })

  return {
    passes,
    passTypes: Array.from(passTypeMap.values()),
    clients: Array.from(clientMap.values())
  }
}

export async function getDashboardData() {
  const passes = await getPasses()
  const products = await getProducts()
  const sales = await getSales()
  const expenses = await getExpenses()
  const notifications = await getNotifications()

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthPrefix = today.slice(0, 7)
  const plus7 = new Date(now)
  plus7.setDate(plus7.getDate() + 7)
  const nextWeek = plus7.toISOString().slice(0, 10)

  return {
    kpis: [
      {
        label: "Bonos activos",
        value: passes.filter((item) => item.status === "active").length.toString()
      },
      {
        label: "Caducan en 7 días",
        value: passes.filter((item) => item.expiresOn <= nextWeek && item.status === "active").length.toString()
      },
      {
        label: "Sin sesiones",
        value: passes.filter((item) => item.passKind === "session" && item.sessionsLeft === 0).length.toString()
      },
      {
        label: "Stock bajo",
        value: products.filter((item) => item.stockOnHand <= item.minStock).length.toString()
      },
      {
        label: "Ventas hoy",
        value: sales
          .filter((item) => item.soldAt.startsWith(today))
          .reduce((sum, item) => sum + item.totalAmount, 0)
          .toFixed(2)
      },
      {
        label: "Ventas del mes",
        value: sales
          .filter((item) => item.soldAt.startsWith(monthPrefix))
          .reduce((sum, item) => sum + item.totalAmount, 0)
          .toFixed(2)
      },
      {
        label: "Gastos del mes",
        value: expenses
          .filter((item) => item.spentOn.startsWith(monthPrefix))
          .reduce((sum, item) => sum + item.totalAmount, 0)
          .toFixed(2)
      }
    ],
    notifications: notifications.slice(0, 5)
  }
}

export async function getClients(): Promise<Client[]> {
  const client = await createAuthedClient()
  if (!client) {
    return demoClients
  }

  const result = await client.database
    .from("clients")
    .select("*")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })

  if (result.error || !result.data) {
    return demoClients
  }

  return (result.data as DbRow[]).map(mapClientRow)
}

export async function getClientById(id: string): Promise<Client | null> {
  const client = await createAuthedClient()
  if (!client) {
    return (await getClients()).find((item) => item.id === id) ?? null
  }

  const result = await client.database.from("clients").select("*").eq("id", id).maybeSingle()
  if (result.error || !result.data) {
    return null
  }

  return mapClientRow(result.data as DbRow)
}

export async function getClientPortalAccountByClientId(
  clientId: string
): Promise<ClientPortalAccountSummary | null> {
  const client = await createAuthedClient()
  if (!client) {
    return null
  }

  try {
    const result = await client.database
      .from("client_portal_accounts")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle()

    if (result.error || !result.data) {
      return null
    }

    return mapClientPortalAccountRow(result.data as DbRow)
  } catch {
    return null
  }
}

export async function getClientPortalSupportState(
  clientId: string
): Promise<ClientPortalSupportState | null> {
  const client = await createAuthedClient()
  if (!client) {
    return null
  }

  const clientResult = await client.database
    .from("clients")
    .select("id,email")
    .eq("id", clientId)
    .maybeSingle()

  if (clientResult.error || !clientResult.data) {
    return null
  }

  const email = clientResult.data.email ? String(clientResult.data.email).trim() : null
  const portalAccount = await getClientPortalAccountByClientId(clientId)

  if (portalAccount) {
    return {
      clientId,
      email,
      emailMatchCount: email ? 1 : 0,
      portalAccount,
      readiness: portalAccount.status === "claimed" ? "claimed" : "disabled",
      message:
        portalAccount.status === "claimed"
          ? "El cliente ya tiene acceso operativo al portal."
          : "El acceso del portal existe, pero ahora mismo esta desactivado."
    }
  }

  if (!email) {
    return {
      clientId,
      email,
      emailMatchCount: 0,
      portalAccount: null,
      readiness: "missing_email",
      message: "Anade un email unico en la ficha para que este cliente pueda registrarse en el portal."
    }
  }

  const duplicateResult = await client.database
    .from("clients")
    .select("id", { count: "exact" })
    .eq("email", email)

  const emailMatchCount = duplicateResult.count ?? 0

  if (emailMatchCount > 1) {
    return {
      clientId,
      email,
      emailMatchCount,
      portalAccount: null,
      readiness: "duplicate_email",
      message: "Este email esta repetido en varias fichas. Corrigelo antes de activar el portal."
    }
  }

  return {
    clientId,
    email,
    emailMatchCount,
    portalAccount: null,
    readiness: "ready_to_claim",
    message: "La ficha esta lista. El cliente ya puede crear acceso en /cliente/registro con este email."
  }
}

export async function getPassTypes(options?: { includeInactive?: boolean }): Promise<PassType[]> {
  const client = await createAuthedClient()
  if (!client) {
    return options?.includeInactive ? demoPassTypes : demoPassTypes.filter((item) => item.isActive)
  }

  let query = client.database.from("pass_types").select("*").order("sort_order", { ascending: true })
  if (!options?.includeInactive) {
    query = query.eq("is_active", true)
  }

  const result = await query

  if (result.error || !result.data) {
    return options?.includeInactive ? demoPassTypes : demoPassTypes.filter((item) => item.isActive)
  }

  return (result.data as DbRow[]).map(mapPassTypeRow)
}

export async function getPasses(): Promise<Pass[]> {
  const passData = await getPassDataFromDb()
  if (!passData) {
    return demoPasses
  }

  return passData.passes
}

export async function getPassById(id: string): Promise<Pass | null> {
  const passes = await getPasses()
  return passes.find((item) => item.id === id) ?? null
}

export async function getProducts(): Promise<Product[]> {
  const client = await createAuthedClient()
  if (!client) {
    return demoProducts
  }

  const result = await client.database.from("products").select("*").order("name", { ascending: true })
  if (result.error || !result.data) {
    return demoProducts
  }

  return (result.data as DbRow[]).map(mapProductRow)
}

export async function getSales(): Promise<Sale[]> {
  const client = await createAuthedClient()
  if (!client) {
    return demoSales
  }

  const [salesResult, clientsResult, saleItemsResult] = await Promise.all([
    client.database.from("sales").select("*").order("sold_at", { ascending: false }),
    client.database.from("clients").select("*"),
    client.database.from("sale_items").select("sale_id,item_type")
  ])

  if (
    salesResult.error ||
    !salesResult.data ||
    clientsResult.error ||
    !clientsResult.data ||
    saleItemsResult.error ||
    !saleItemsResult.data
  ) {
    return demoSales
  }

  const clientMap = new Map(
    (clientsResult.data as DbRow[]).map((row) => [String(row.id), mapClientRow(row)])
  )
  const saleTypeMap = new Map<string, Sale["saleType"]>()

  for (const row of saleItemsResult.data as DbRow[]) {
    const saleId = String(row.sale_id ?? "")
    if (!saleId) {
      continue
    }

    if (String(row.item_type ?? "") === "product") {
      saleTypeMap.set(saleId, "product")
      continue
    }

    if (!saleTypeMap.has(saleId)) {
      saleTypeMap.set(saleId, "pass")
    }
  }

  return (salesResult.data as DbRow[]).map((row) => ({
    id: String(row.id),
    invoiceNumber: Number(row.invoice_seq ?? 0),
    invoiceCode: String(row.invoice_code ?? ""),
    soldAt: String(row.sold_at ?? ""),
    totalAmount: Number(row.total_gross ?? 0),
    paymentMethod: String(row.payment_method ?? "cash") as Sale["paymentMethod"],
    saleType: saleTypeMap.get(String(row.id)) ?? "pass",
    clientName: row.client_id ? clientMap.get(String(row.client_id))?.fullName ?? null : null,
    isVoided: String(row.status ?? "posted") === "void",
    status: String(row.status ?? "posted") as Sale["status"],
    ticketPublicUrl: row.ticket_public_url ? String(row.ticket_public_url) : null
  }))
}

export async function getExpenses(): Promise<Expense[]> {
  const client = await createAuthedClient()
  if (!client) {
    return demoExpenses
  }

  const result = await client.database.from("expenses").select("*").order("spent_on", { ascending: false })
  if (result.error || !result.data) {
    return demoExpenses
  }

  return (result.data as DbRow[]).map(mapExpenseRow)
}

export async function getNotifications(): Promise<NotificationLogItem[]> {
  const client = await createAuthedClient()
  if (!client) {
    return demoNotifications
  }

  const [notificationsResult, clientsResult] = await Promise.all([
    client.database.from("notification_log").select("*").order("created_at", { ascending: false }),
    client.database.from("clients").select("*")
  ])

  if (
    notificationsResult.error ||
    !notificationsResult.data ||
    clientsResult.error ||
    !clientsResult.data
  ) {
    return demoNotifications
  }

  const clientMap = new Map(
    (clientsResult.data as DbRow[]).map((row) => [String(row.id), mapClientRow(row)])
  )

  return (notificationsResult.data as DbRow[]).map((row) => ({
    ...mapNotificationRow(row),
    clientName: row.client_id ? clientMap.get(String(row.client_id))?.fullName ?? null : null
  }))
}

export async function getCalendarSessions(): Promise<CalendarSession[]> {
  const client = await createAuthedClient()
  if (!client) {
    return demoCalendarSessions
  }

  const [sessionsResult, profilesResult, clientsResult, sessionPassesResult, passesResult, passTypesResult, holdersResult] = await Promise.all([
    client.database.from("calendar_sessions").select("*").order("starts_at", { ascending: true }),
    client.database.from("profiles").select("id,full_name,calendar_color"),
    client.database.from("clients").select("id,first_name,last_name"),
    client.database.from("calendar_session_passes").select("*"),
    client.database.from("passes").select("id,pass_type_id"),
    client.database.from("pass_types").select("id,name"),
    client.database.from("pass_holders").select("*").order("holder_order", { ascending: true })
  ])

  if (
    sessionsResult.error ||
    !sessionsResult.data ||
    profilesResult.error ||
    !profilesResult.data ||
    clientsResult.error ||
    !clientsResult.data
  ) {
    return demoCalendarSessions
  }

  const profileMap = new Map(
    (profilesResult.data as DbRow[]).map((row) => [
      String(row.id),
      {
        fullName: String(row.full_name ?? "Entrenador"),
        calendarColor: String(row.calendar_color ?? "#BFDBFE")
      }
    ])
  )
  const clientMap = new Map(
    (clientsResult.data as DbRow[]).map((row) => [
      String(row.id),
      `${String(row.first_name ?? "")} ${String(row.last_name ?? "")}`.trim()
    ])
  )
  const passTypeMap = new Map(
    ((passTypesResult.data as DbRow[] | undefined) ?? []).map((row) => [String(row.id), String(row.name ?? "Bono")])
  )
  const passLabelMap = new Map(
    ((passesResult.data as DbRow[] | undefined) ?? []).map((row) => [
      String(row.id),
      passTypeMap.get(String(row.pass_type_id)) ?? "Bono"
    ])
  )
  const holderClientIdsByPass = new Map<string, string[]>()
  for (const row of ((holdersResult.data as DbRow[] | undefined) ?? [])) {
    const passId = String(row.pass_id ?? "")
    const existing = holderClientIdsByPass.get(passId) ?? []
    existing.push(String(row.client_id ?? ""))
    holderClientIdsByPass.set(passId, existing)
  }
  const passIdsBySession = new Map<string, string[]>()
  if (!sessionPassesResult.error && sessionPassesResult.data) {
    for (const row of sessionPassesResult.data as DbRow[]) {
      const sessionId = String(row.session_id ?? "")
      const existing = passIdsBySession.get(sessionId) ?? []
      existing.push(String(row.pass_id ?? ""))
      passIdsBySession.set(sessionId, existing)
    }
  }

  return (sessionsResult.data as DbRow[]).map((row) => {
    const sessionId = String(row.id)
    const passIds = passIdsBySession.get(sessionId) ?? (row.pass_id ? [String(row.pass_id)] : [])
    const clientNames = Array.from(
      new Set(
        passIds
          .flatMap((passId) => holderClientIdsByPass.get(passId) ?? [])
          .map((clientId) => clientMap.get(clientId) ?? null)
          .filter(Boolean)
      )
    )
    const profile = profileMap.get(String(row.trainer_profile_id))

    return mapCalendarRow({
      ...row,
      trainer_name: profile?.fullName ?? "Entrenador",
      trainer_color: profile?.calendarColor ?? "#BFDBFE",
      client_1_name: clientMap.get(String(row.client_1_id)) ?? "Cliente",
      client_2_name: row.client_2_id ? clientMap.get(String(row.client_2_id)) ?? null : null,
      client_names: clientNames.length ? clientNames : undefined,
      pass_ids: passIds,
      pass_labels: passIds.map((passId) => passLabelMap.get(passId) ?? "Bono")
    })
  })
}

export async function getTrainerProfiles(): Promise<Array<{ id: string; fullName: string; role: string; calendarColor: string }>> {
  const client = await createAuthedClient()
  if (!client) {
    return []
  }

  const result = await client.database
    .from("profiles")
    .select("id,full_name,role,is_active,calendar_color")
    .eq("is_active", true)
    .in("role", ["admin", "trainer"])
    .order("full_name", { ascending: true })

  if (result.error || !result.data) {
    return []
  }

  return (result.data as DbRow[]).map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name ?? ""),
    role: String(row.role ?? "trainer"),
    calendarColor: String(row.calendar_color ?? "#BFDBFE")
  }))
}

export async function getClientHistory(clientId: string): Promise<ClientHistoryItem[]> {
  const client = await createAuthedClient()
  if (!client) {
    return []
  }

  const passIdsResult = await client.database
    .from("pass_holders")
    .select("pass_id")
    .eq("client_id", clientId)

  const passIds = (passIdsResult.data ?? []).map((row: any) => String(row.pass_id))

  const [sessionsResult, pausesResult, notificationsResult] = await Promise.all([
    passIds.length
      ? client.database
          .from("session_consumptions")
          .select("*")
          .in("pass_id", passIds)
          .order("consumed_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    passIds.length
      ? client.database.from("pass_pauses").select("*").in("pass_id", passIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    client.database
      .from("notification_log")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
  ])

  const history: ClientHistoryItem[] = []

  for (const row of (sessionsResult.data as DbRow[] | undefined) ?? []) {
    history.push({
      id: `session-${row.id}`,
      kind: "session",
      happenedAt: String(row.consumed_at ?? row.created_at ?? ""),
      title: "Sesión consumida",
      detail: String(row.notes ?? "Consumo manual de sesión")
    })
  }

  for (const row of (pausesResult.data as DbRow[] | undefined) ?? []) {
    history.push({
      id: `pause-${row.id}`,
      kind: "pause",
      happenedAt: String(row.created_at ?? ""),
      title: "Bono pausado",
      detail: `${String(row.starts_on ?? "")} a ${String(row.ends_on ?? "")}`
    })
  }

  for (const row of (notificationsResult.data as DbRow[] | undefined) ?? []) {
    if (String(row.event_type ?? "") === "renewal_confirmation") {
      history.push({
        id: `renewal-${row.id}`,
        kind: "renewal",
        happenedAt: String(row.created_at ?? ""),
        title: "Renovacion registrada",
        detail: String(row.body ?? "Renovacion de bono")
      })
    }
  }

  return history.sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
}
