import { format, subDays } from "date-fns"
import { getCurrentPortalAccessToken, requirePortalAccount } from "@/lib/auth/portal-session"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { isClientPreview } from "@/lib/preview-mode"
import { getPreviewPortalNutritionData } from "@/features/client-portal/preview-data"
import type { Client } from "@/types/domain"
import { nutritionAssistantConfig } from "@/features/client-portal/nutrition/config"

type DbRow = Record<string, unknown>
type DayKey = "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo"

export type NutritionChatMessage = {
  id: string
  threadId: string
  clientId: string
  role: "user" | "assistant" | "system"
  content: string
  modelId: string | null
  createdAt: string
  metadata: Record<string, unknown>
}

export type NutritionMemory = {
  heightCm: number | null
  weightKg: number | null
  goal: string | null
  mealsPerDay: number | null
  dietaryPattern: string | null
  intermittentFasting: boolean | null
  allergies: string | null
  intolerances: string | null
  foodsToAvoid: string | null
  preferredFoods: string | null
  usualSchedule: string | null
  rollingSummary: string | null
  rollingSummaryMessageCount: number
  rollingSummaryRefreshedAt: string | null
  rollingSummaryModelId: string | null
}

export type NutritionQuotaStatus = {
  dailyUsed: number
  dailyLimit: number
  dailyRemaining: number
  monthlyUsed: number
  monthlyLimit: number
  monthlyRemaining: number
  blocked: boolean
}

export type WeeklyNutritionPlanDay = {
  focus: string
  meals: Array<{
    title: string
    detail: string
  }>
}

export type WeeklyNutritionPlanPayload = {
  weekGoal: string
  notes: string
  shoppingList: string[]
  days: Record<DayKey, WeeklyNutritionPlanDay>
}

export type WeeklyNutritionPlan = {
  id: string
  title: string
  weekStartsOn: string
  generatedByModel: string | null
  createdAt: string
  plan: WeeklyNutritionPlanPayload
}

export type PortalNutritionData = {
  client: Client
  threadId: string | null
  messages: NutritionChatMessage[]
  assistantConfigId: typeof nutritionAssistantConfig.id
  memory: NutritionMemory
  quota: NutritionQuotaStatus
  recentTrainingSummary: string
  savedPlans: WeeklyNutritionPlan[]
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

function mapNutritionMessage(row: DbRow): NutritionChatMessage {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    clientId: String(row.client_id),
    role: String(row.role ?? "assistant") as NutritionChatMessage["role"],
    content: String(row.content ?? ""),
    modelId: row.model_id ? String(row.model_id) : null,
    createdAt: String(row.created_at ?? ""),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata as Record<string, unknown>
        : {}
  }
}

function mapNutritionMemory(row?: DbRow | null): NutritionMemory {
  return {
    heightCm: row?.height_cm === null || row?.height_cm === undefined ? null : Number(row.height_cm),
    weightKg: row?.weight_kg === null || row?.weight_kg === undefined ? null : Number(row.weight_kg),
    goal: row?.goal ? String(row.goal) : null,
    mealsPerDay: row?.meals_per_day === null || row?.meals_per_day === undefined ? null : Number(row.meals_per_day),
    dietaryPattern: row?.dietary_pattern ? String(row.dietary_pattern) : null,
    intermittentFasting:
      typeof row?.intermittent_fasting === "boolean" ? Boolean(row.intermittent_fasting) : null,
    allergies: row?.allergies ? String(row.allergies) : null,
    intolerances: row?.intolerances ? String(row.intolerances) : null,
    foodsToAvoid: row?.foods_to_avoid ? String(row.foods_to_avoid) : null,
    preferredFoods: row?.preferred_foods ? String(row.preferred_foods) : null,
    usualSchedule: row?.usual_schedule ? String(row.usual_schedule) : null,
    rollingSummary: row?.rolling_summary ? String(row.rolling_summary) : null,
    rollingSummaryMessageCount:
      row?.rolling_summary_message_count === null || row?.rolling_summary_message_count === undefined
        ? 0
        : Number(row.rolling_summary_message_count),
    rollingSummaryRefreshedAt: row?.rolling_summary_refreshed_at
      ? String(row.rolling_summary_refreshed_at)
      : null,
    rollingSummaryModelId: row?.rolling_summary_model_id ? String(row.rolling_summary_model_id) : null
  }
}

function mapQuota(row: DbRow): NutritionQuotaStatus {
  return {
    dailyUsed: Number(row.daily_used ?? 0),
    dailyLimit: Number(row.daily_limit ?? 20),
    dailyRemaining: Number(row.daily_remaining ?? 20),
    monthlyUsed: Number(row.monthly_used ?? 0),
    monthlyLimit: Number(row.monthly_limit ?? 300),
    monthlyRemaining: Number(row.monthly_remaining ?? 300),
    blocked: Boolean(row.blocked)
  }
}

function mapWeeklyPlan(row: DbRow): WeeklyNutritionPlan {
  const rawPlan =
    row.plan_json && typeof row.plan_json === "object" && !Array.isArray(row.plan_json)
      ? row.plan_json as Record<string, unknown>
      : {}
  const rawDays =
    rawPlan.days && typeof rawPlan.days === "object" && !Array.isArray(rawPlan.days)
      ? rawPlan.days as Record<string, unknown>
      : {}

  const makeDay = (key: DayKey): WeeklyNutritionPlanDay => {
    const rawDay =
      rawDays[key] && typeof rawDays[key] === "object" && !Array.isArray(rawDays[key])
        ? rawDays[key] as Record<string, unknown>
        : {}
    const meals = Array.isArray(rawDay.meals)
      ? rawDay.meals
          .filter((meal) => meal && typeof meal === "object" && !Array.isArray(meal))
          .map((meal) => ({
            title: String((meal as Record<string, unknown>).title ?? ""),
            detail: String((meal as Record<string, unknown>).detail ?? "")
          }))
      : []

    return {
      focus: String(rawDay.focus ?? ""),
      meals
    }
  }

  return {
    id: String(row.id),
    title: String(row.title ?? "Menu semanal"),
    weekStartsOn: String(row.week_starts_on ?? ""),
    generatedByModel: row.generated_by_model ? String(row.generated_by_model) : null,
    createdAt: String(row.created_at ?? ""),
    plan: {
      weekGoal: String(rawPlan.week_goal ?? ""),
      notes: String(rawPlan.notes ?? ""),
      shoppingList: Array.isArray(rawPlan.shopping_list)
        ? rawPlan.shopping_list.map((item) => String(item))
        : [],
      days: {
        lunes: makeDay("lunes"),
        martes: makeDay("martes"),
        miercoles: makeDay("miercoles"),
        jueves: makeDay("jueves"),
        viernes: makeDay("viernes"),
        sabado: makeDay("sabado"),
        domingo: makeDay("domingo")
      }
    }
  }
}

async function callPortalFunction<T>(
  functionName: string,
  accessToken: string,
  body?: Record<string, unknown>
) {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL

  if (!baseUrl) {
    throw new Error("Falta NEXT_PUBLIC_INSFORGE_URL para el portal.")
  }

  const response = await fetch(`${baseUrl}/functions/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body ?? {})
  })

  const payload = await response.json().catch(() => null) as
    | (T & { message?: string })
    | { message?: string }
    | null

  if (!response.ok || !payload) {
    throw new Error(
      (payload && "message" in payload && payload.message) ||
      "No se pudo completar la operacion nutricional."
    )
  }

  return payload as T
}

export async function ensurePortalNutritionThread(accessToken: string) {
  return callPortalFunction<{
    thread_id?: string
    threadId?: string
    client_id?: string
    nutrition_profile_id?: string
  }>("ensure_client_nutrition_thread", accessToken)
}

export async function appendPortalNutritionMessage(
  accessToken: string,
  payload: {
    role: "user" | "assistant" | "system"
    content: string
    modelId?: string | null
    metadata?: Record<string, unknown>
  }
) {
  return callPortalFunction<{
    thread_id?: string
    threadId?: string
    quota?: DbRow
    message: {
      id: string
      thread_id?: string
      threadId?: string
      client_id?: string
      clientId?: string
      role: "user" | "assistant" | "system"
      content: string
      model_id?: string | null
      modelId?: string | null
      metadata?: Record<string, unknown>
      created_at?: string
      createdAt?: string
    }
  }>("append_nutrition_message", accessToken, payload)
}

export async function updatePortalNutritionMemory(
  accessToken: string,
  updates: Record<string, unknown>
) {
  return callPortalFunction<{
    profile: DbRow
  }>("update_client_nutrition_memory", accessToken, { updates })
}

export async function refreshPortalNutritionSummary(
  accessToken: string,
  payload: {
    summary: string
    rollingSummaryMessageCount: number
    modelId: string
  }
) {
  return callPortalFunction<{
    profile: DbRow
  }>("refresh_client_nutrition_summary", accessToken, payload)
}

export async function savePortalWeeklyNutritionPlan(
  accessToken: string,
  payload: {
    weekStartsOn: string
    title: string
    generatedByModel: string
    plan: WeeklyNutritionPlanPayload
  }
) {
  return callPortalFunction<{
    plan: DbRow
  }>("save_weekly_nutrition_plan", accessToken, payload)
}

export async function resetPortalNutritionChat(accessToken: string) {
  return callPortalFunction<{ ok: boolean }>("reset_client_nutrition_chat", accessToken)
}

export async function resetPortalNutritionMemory(accessToken: string) {
  return callPortalFunction<{ ok: boolean }>("reset_client_nutrition_memory", accessToken)
}

export async function deletePortalWeeklyNutritionPlans(accessToken: string) {
  return callPortalFunction<{ ok: boolean; deletedCount: number }>(
    "delete_client_weekly_nutrition_plans",
    accessToken
  )
}

export async function getPortalNutritionQuotaStatus(accessToken: string, authUserId: string) {
  const client = createServerInsforgeClient({ accessToken }) as any
  const result = await client.database.rpc("app_get_client_nutrition_quota_status", {
    p_auth_user_id: authUserId
  })

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "No se pudo cargar la cuota nutricional.")
  }

  return mapQuota(result.data as DbRow)
}

async function buildRecentTrainingSummary(accessToken: string, clientId: string) {
  const client = createServerInsforgeClient({ accessToken }) as any
  const since = subDays(new Date(), 30).toISOString()
  const sessionsResult = await client.database
    .from("session_consumptions")
    .select("id,consumed_at,notes")
    .eq("client_id", clientId)
    .gte("consumed_at", since)
    .order("consumed_at", { ascending: false })

  if (sessionsResult.error || !sessionsResult.data) {
    return "Resumen de entrenamiento reciente no disponible."
  }

  const sessions = sessionsResult.data as DbRow[]

  if (!sessions.length) {
    return "No hay sesiones registradas en los ultimos 30 dias."
  }

  const lastSession = String(sessions[0].consumed_at ?? "")
  const notes = sessions
    .slice(0, 3)
    .map((row) => String(row.notes ?? "").trim())
    .filter(Boolean)

  return [
    `Sesiones registradas en los ultimos 30 dias: ${sessions.length}.`,
    `Ultima sesion: ${format(new Date(lastSession), "dd/MM/yyyy")}.`,
    notes.length ? `Notas recientes: ${notes.join(" | ")}.` : "Sin notas recientes de entrenamiento."
  ].join(" ")
}

export async function loadPortalNutritionConversation(
  accessToken: string,
  clientId: string,
  threadId: string | null,
  authUserId: string
) {
  const client = createServerInsforgeClient({ accessToken }) as any

  const [clientResult, profileResult, quota, trainingSummary, plansResult] = await Promise.all([
    client.database
      .from("clients")
      .select("id,first_name,last_name,email,phone,notes,is_active")
      .eq("id", clientId)
      .maybeSingle(),
    client.database
      .from("client_nutrition_profiles")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle(),
    getPortalNutritionQuotaStatus(accessToken, authUserId),
    buildRecentTrainingSummary(accessToken, clientId),
    client.database
      .from("weekly_nutrition_plans")
      .select("*")
      .eq("client_id", clientId)
      .order("week_starts_on", { ascending: false })
  ])

  if (clientResult.error || !clientResult.data) {
    throw new Error("No se ha podido cargar el perfil del cliente para nutricion.")
  }

  let messages: NutritionChatMessage[] = []

  if (threadId) {
    const messagesResult = await client.database
      .from("nutrition_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })

    if (messagesResult.error || !messagesResult.data) {
      throw new Error("No se ha podido cargar el historial nutricional.")
    }

    messages = (messagesResult.data as DbRow[]).map(mapNutritionMessage)
  }

  if (plansResult.error || !plansResult.data) {
    throw new Error("No se han podido cargar los planes semanales guardados.")
  }

  return {
    client: mapPortalClient(clientResult.data as DbRow),
    threadId,
    messages,
    assistantConfigId: nutritionAssistantConfig.id,
    memory: mapNutritionMemory((profileResult.data as DbRow | null) ?? null),
    quota,
    recentTrainingSummary: trainingSummary,
    savedPlans: (plansResult.data as DbRow[]).map(mapWeeklyPlan)
  } satisfies PortalNutritionData
}

export async function getPortalNutritionData(): Promise<PortalNutritionData> {
  if (await isClientPreview()) {
    return getPreviewPortalNutritionData()
  }

  const portalAccount = await requirePortalAccount()
  const accessToken = await getCurrentPortalAccessToken()

  if (!accessToken) {
    throw new Error("No se ha podido validar la sesion nutricional del portal.")
  }

  const ensured = await ensurePortalNutritionThread(accessToken)
  const threadId = String(ensured.thread_id ?? ensured.threadId ?? "")

  return loadPortalNutritionConversation(
    accessToken,
    portalAccount.clientId,
    threadId || null,
    portalAccount.authUserId
  )
}

export function buildNutritionContextMessages(messages: NutritionChatMessage[]) {
  const cutoff = subDays(new Date(), nutritionAssistantConfig.maxContextDays)

  return messages
    .filter((message) => {
      const createdAt = new Date(message.createdAt)
      return !Number.isNaN(createdAt.getTime()) && createdAt >= cutoff
    })
    .slice(-nutritionAssistantConfig.maxContextMessages)
    .map((message) => ({
      role: message.role,
      content: message.content
    }))
}

export function buildNutritionMemoryBlock(memory: NutritionMemory) {
  return [
    `Altura: ${memory.heightCm ?? "sin dato"} cm`,
    `Peso: ${memory.weightKg ?? "sin dato"} kg`,
    `Objetivo: ${memory.goal ?? "sin dato"}`,
    `Comidas al dia: ${memory.mealsPerDay ?? "sin dato"}`,
    `Patron alimentario: ${memory.dietaryPattern ?? "sin dato"}`,
    `Ayuno intermitente: ${
      memory.intermittentFasting === null
        ? "sin dato"
        : memory.intermittentFasting
          ? "si"
          : "no"
    }`,
    `Alergias: ${memory.allergies ?? "sin dato"}`,
    `Intolerancias: ${memory.intolerances ?? "sin dato"}`,
    `Alimentos a evitar: ${memory.foodsToAvoid ?? "sin dato"}`,
    `Alimentos preferidos: ${memory.preferredFoods ?? "sin dato"}`,
    `Horario habitual: ${memory.usualSchedule ?? "sin dato"}`
  ].join("\n")
}

export function shouldRefreshRollingSummary(memory: NutritionMemory, messages: NutritionChatMessage[]) {
  const unsummarizedMessages = Math.max(messages.length - memory.rollingSummaryMessageCount, 0)

  if (!memory.rollingSummary && messages.length >= 6) {
    return true
  }

  if (unsummarizedMessages >= 8) {
    return true
  }

  if (!memory.rollingSummaryRefreshedAt) {
    return false
  }

  const refreshedAt = new Date(memory.rollingSummaryRefreshedAt)
  if (Number.isNaN(refreshedAt.getTime())) {
    return false
  }

  return unsummarizedMessages >= 4 && refreshedAt < subDays(new Date(), 3)
}
