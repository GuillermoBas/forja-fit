import { startOfWeek } from "date-fns"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { getCurrentPortalAccessToken, getCurrentPortalAccount } from "@/lib/auth/portal-session"
import {
  appendPortalNutritionMessage,
  buildNutritionContextMessages,
  buildNutritionMemoryBlock,
  getPortalNutritionQuotaStatus,
  loadPortalNutritionConversation,
  refreshPortalNutritionSummary,
  savePortalWeeklyNutritionPlan,
  shouldRefreshRollingSummary,
  updatePortalNutritionMemory,
  type NutritionChatMessage,
  type PortalNutritionData,
  type WeeklyNutritionPlanPayload
} from "@/features/client-portal/nutrition/server"
import { nutritionAssistantConfig } from "@/features/client-portal/nutrition/config"
import {
  classifyNutritionPrompt,
  getNutritionRefusalMessage
} from "@/features/client-portal/nutrition/policy"
import { nutritionToolDefinitions } from "@/features/client-portal/nutrition/tools"

export const dynamic = "force-dynamic"

type ToolCall = {
  id?: string
  function?: {
    name?: string
    arguments?: string
  }
}

type WeeklyPlanDraft = {
  weekStartsOn: string
  title: string
  plan: WeeklyNutritionPlanPayload
}

const weeklyPlanDayKeys = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo"
] as const

const nutritionMemoryIntentPattern = /\b(mido|peso|objetivo|comidas al dia|ayuno|alerg|intoleran|evito|prefiero|horario|recuerda|memoria|sabes de mi)\b/i
const saveWeeklyPlanIntentPattern = /\bguardamelo\b|\bguardalo\b|\bconservalo\b|\b(guarda|guardame|guardar|persist|conserva)\b.*\b(menu|plan)\b|\b(menu|plan)\b.*\b(guarda|guardame|guardar|persist|conserva)\b/i
const mealsPerDayWordMap: Record<string, number> = {
  una: 1,
  un: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6
}
const nutritionMemoryToolDefinitions = nutritionToolDefinitions.filter(
  (tool) => tool.function.name !== "save_weekly_plan"
)

function toClientMessage(message: {
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
}) {
  return {
    id: message.id,
    threadId: String(message.thread_id ?? message.threadId ?? ""),
    clientId: String(message.client_id ?? message.clientId ?? ""),
    role: message.role,
    content: message.content,
    modelId: message.model_id ?? message.modelId ?? null,
    metadata: message.metadata ?? {},
    createdAt: String(message.created_at ?? message.createdAt ?? new Date().toISOString())
  }
}

function buildAssistantContext(conversation: PortalNutritionData) {
  return [
    {
      role: "system" as const,
      content: nutritionAssistantConfig.systemPrompt
    },
    {
      role: "system" as const,
      content: `Bloque de memoria nutricional persistente:\n${buildNutritionMemoryBlock(conversation.memory)}`
    },
    {
      role: "system" as const,
      content: `Resumen breve de entrenamiento reciente:\n${conversation.recentTrainingSummary}`
    },
    {
      role: "system" as const,
      content: `Rolling summary:\n${conversation.memory.rollingSummary ?? "Sin resumen acumulado todavia."}`
    },
    ...buildNutritionContextMessages(conversation.messages)
  ]
}

function normalizeIntentMessage(message: string) {
  return message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function isWeeklyMenuRequest(message: string) {
  return nutritionAssistantConfig.weeklyMenuRequestPattern.test(normalizeIntentMessage(message))
}

function isWeeklyPlanSaveRequest(message: string) {
  return saveWeeklyPlanIntentPattern.test(normalizeIntentMessage(message))
}

function shouldAttemptMemoryToolPass(message: string) {
  return nutritionMemoryIntentPattern.test(normalizeIntentMessage(message))
}

function parseToolArguments(rawArguments?: string) {
  if (!rawArguments) {
    return {}
  }

  try {
    const parsed = JSON.parse(rawArguments)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function resolveWeekStartsOn(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim()
  }

  return startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().slice(0, 10)
}

function resolveRequestedMealsPerDay(message: string, memory: PortalNutritionData["memory"]) {
  const normalizedMessage = normalizeIntentMessage(message)
  const numericMatch = normalizedMessage.match(/\b([1-6])\s*(?:comidas?|ingestas?)\s*(?:al dia|diarias?)?\b/)

  if (numericMatch) {
    return Number(numericMatch[1])
  }

  const wordMatch = normalizedMessage.match(/\b(una|un|uno|dos|tres|cuatro|cinco|seis)\s*(?:comidas?|ingestas?)\s*(?:al dia|diarias?)?\b/)

  if (wordMatch) {
    return mealsPerDayWordMap[wordMatch[1]] ?? 4
  }

  if (
    typeof memory.mealsPerDay === "number" &&
    Number.isFinite(memory.mealsPerDay) &&
    memory.mealsPerDay >= 1 &&
    memory.mealsPerDay <= 6
  ) {
    return memory.mealsPerDay
  }

  return 4
}

function resolveWeeklyPlanJsonMaxTokens(mealsPerDay: number) {
  return Math.min(3200, Math.max(1700, 1100 + mealsPerDay * 360))
}

function buildWeeklyPlanJsonSchemaPrompt(mealsPerDay: number) {
  return [
    "Genera o convierte un menu semanal de 7 dias y devuelve solo JSON valido.",
    "Usa exactamente este esquema:",
    "{",
    '"week_starts_on":"YYYY-MM-DD",',
    '"title":"string",',
    '"plan":{',
    '"week_goal":"string",',
    '"notes":"string",',
    '"shopping_list":["string"],',
    '"days":{',
    '"lunes":{"focus":"string","meals":[{"title":"string","detail":"string"}]},',
    '"martes":{"focus":"string","meals":[{"title":"string","detail":"string"}]},',
    '"miercoles":{"focus":"string","meals":[{"title":"string","detail":"string"}]},',
    '"jueves":{"focus":"string","meals":[{"title":"string","detail":"string"}]},',
    '"viernes":{"focus":"string","meals":[{"title":"string","detail":"string"}]},',
    '"sabado":{"focus":"string","meals":[{"title":"string","detail":"string"}]},',
    '"domingo":{"focus":"string","meals":[{"title":"string","detail":"string"}]}',
    "}",
    "}",
    "}",
    `Cada dia debe incluir exactamente ${mealsPerDay} comidas en el array meals.`,
    "Cada comida debe tener title y detail.",
    "Mantén cada detail breve, claro y realista.",
    "No anadas texto fuera del JSON."
  ].join("\n")
}

function extractJsonObject(rawContent: string) {
  const trimmed = rawContent.trim()

  if (!trimmed) {
    throw new Error("El modelo no devolvio contenido para generar el menu semanal.")
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No se pudo leer el JSON del menu semanal.")
  }

  return candidate.slice(start, end + 1)
}

function normalizeWeeklyPlanPayload(
  rawPlan: unknown,
  mealsPerDay: number
): WeeklyNutritionPlanPayload {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    throw new Error("El plan semanal no tiene una estructura valida.")
  }

  const planRecord = rawPlan as Record<string, unknown>
  const rawDays = planRecord.days

  if (!rawDays || typeof rawDays !== "object" || Array.isArray(rawDays)) {
    throw new Error("Faltan los dias del plan semanal.")
  }

  const days = Object.fromEntries(
    weeklyPlanDayKeys.map((dayKey) => {
      const rawDay = (rawDays as Record<string, unknown>)[dayKey]

      if (!rawDay || typeof rawDay !== "object" || Array.isArray(rawDay)) {
        throw new Error(`Falta la estructura del dia ${dayKey}.`)
      }

      const meals = Array.isArray((rawDay as Record<string, unknown>).meals)
        ? ((rawDay as Record<string, unknown>).meals as unknown[])
            .filter((meal) => meal && typeof meal === "object" && !Array.isArray(meal))
            .map((meal) => ({
              title: String((meal as Record<string, unknown>).title ?? "").trim(),
              detail: String((meal as Record<string, unknown>).detail ?? "").trim()
            }))
            .filter((meal) => meal.title && meal.detail)
        : []

      if (meals.length < mealsPerDay) {
        throw new Error(`El dia ${dayKey} no incluye suficientes comidas.`)
      }

      return [dayKey, {
        focus: String((rawDay as Record<string, unknown>).focus ?? "").trim(),
        meals: meals.slice(0, mealsPerDay)
      }]
    })
  ) as WeeklyNutritionPlanPayload["days"]

  return {
    weekGoal: String(planRecord.week_goal ?? "").trim(),
    notes: String(planRecord.notes ?? "").trim(),
    shoppingList: Array.isArray(planRecord.shopping_list)
      ? planRecord.shopping_list
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [],
    days
  }
}

async function generateWeeklyPlanDraft(
  aiClient: any,
  conversation: PortalNutritionData,
  userMessage: string,
  mealsPerDay: number
) {
  const attemptMessages = [
    [
      {
        role: "system",
        content: [
          "Eres el generador estructurado de menus semanales de ForjaFit.",
          "Devuelves exclusivamente JSON valido, sin markdown, sin explicaciones y sin texto adicional.",
          "No hagas preguntas de onboarding en esta tarea.",
          "Si faltan datos, asume un menu general prudente orientado al objetivo del cliente."
        ].join(" ")
      },
      {
        role: "system",
        content: `Memoria nutricional actual:\n${buildNutritionMemoryBlock(conversation.memory)}`
      },
      {
        role: "system",
        content: `Resumen breve de entrenamiento reciente:\n${conversation.recentTrainingSummary}`
      },
      {
        role: "system",
        content: `Rolling summary:\n${conversation.memory.rollingSummary ?? "Sin resumen acumulado todavia."}`
      },
      {
        role: "system",
        content: buildWeeklyPlanJsonSchemaPrompt(mealsPerDay)
      },
      {
        role: "user",
        content: userMessage
      }
    ],
    [
      {
        role: "system",
        content: [
          "Repite la tarea anterior devolviendo SOLO un objeto JSON valido.",
          "La respuesta debe empezar por { y terminar por }.",
          "No anadas comillas triples, markdown ni texto fuera del JSON."
        ].join(" ")
      },
      {
        role: "system",
        content: `Memoria nutricional actual:\n${buildNutritionMemoryBlock(conversation.memory)}`
      },
      {
        role: "system",
        content: buildWeeklyPlanJsonSchemaPrompt(mealsPerDay)
      },
      {
        role: "user",
        content: userMessage
      }
    ]
  ]

  let lastError: Error | null = null

  for (const messages of attemptMessages) {
    try {
      const generation = await aiClient.ai.chat.completions.create({
        model: nutritionAssistantConfig.modelId,
        messages,
        temperature: 0.15,
        maxTokens: resolveWeeklyPlanJsonMaxTokens(mealsPerDay)
      })

      const rawContent = String(generation?.choices?.[0]?.message?.content ?? "").trim()
      const parsed = JSON.parse(extractJsonObject(rawContent)) as {
        week_starts_on?: string
        title?: string
        plan?: WeeklyNutritionPlanPayload
      }

      return {
        weekStartsOn: resolveWeekStartsOn(parsed.week_starts_on),
        title: typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim().slice(0, 120)
          : "Menu semanal",
        plan: normalizeWeeklyPlanPayload(parsed.plan, mealsPerDay)
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("No se pudo generar el menu semanal.")
    }
  }

  throw lastError ?? new Error("No se pudo generar el menu semanal.")
}

async function extractWeeklyPlanDraftFromContent(
  aiClient: any,
  content: string,
  mealsPerDay: number
) {
  const extraction = await aiClient.ai.chat.completions.create({
    model: nutritionAssistantConfig.modelId,
    messages: [
      {
        role: "system",
        content: [
          "Convierte el siguiente menu semanal ya redactado a JSON valido.",
          buildWeeklyPlanJsonSchemaPrompt(mealsPerDay),
          "No inventes datos que no aparezcan con claridad.",
          "Si falta week_starts_on, usa la semana actual."
        ].join("\n")
      },
      {
        role: "user",
        content
      }
    ],
    temperature: 0.1,
    maxTokens: resolveWeeklyPlanJsonMaxTokens(mealsPerDay)
  })

  const rawContent = String(extraction?.choices?.[0]?.message?.content ?? "").trim()
  const parsed = JSON.parse(extractJsonObject(rawContent)) as {
    week_starts_on?: string
    title?: string
    plan?: WeeklyNutritionPlanPayload
  }

  return {
    weekStartsOn: resolveWeekStartsOn(parsed.week_starts_on),
    title: typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim().slice(0, 120)
      : "Menu semanal",
    plan: normalizeWeeklyPlanPayload(parsed.plan, mealsPerDay)
  } satisfies WeeklyPlanDraft
}

async function saveWeeklyPlanDraft(accessToken: string, draft: WeeklyPlanDraft) {
  await savePortalWeeklyNutritionPlan(accessToken, {
    weekStartsOn: draft.weekStartsOn,
    title: draft.title,
    generatedByModel: nutritionAssistantConfig.modelId,
    plan: {
      week_goal: draft.plan.weekGoal,
      notes: draft.plan.notes,
      shopping_list: draft.plan.shoppingList,
      days: draft.plan.days
    } as unknown as WeeklyNutritionPlanPayload
  })
}

function looksLikeWeeklyMenuContent(content: string) {
  const normalizedContent = normalizeIntentMessage(content)
  const dayMatches = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
    .filter((day) => normalizedContent.includes(day))
    .length

  return dayMatches >= 4
}

function findLastAssistantMenuContent(messages: NutritionChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]

    if (
      message.role === "assistant" &&
      message.content.trim() &&
      looksLikeWeeklyMenuContent(message.content)
    ) {
      return message.content
    }
  }

  return null
}

function buildWeeklyPlanSavedNote(saved: boolean) {
  return saved
    ? "\n\n**Guardado:** He dejado este menu en tus planes semanales."
    : "\n\n**Guardado pendiente:** No he podido guardarlo esta vez. Pidemelo de nuevo y lo intento otra vez."
}

function buildWeeklyPlanMarkdown(draft: WeeklyPlanDraft) {
  const dayOrder: Array<keyof WeeklyNutritionPlanPayload["days"]> = [
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
    "domingo"
  ]

  const headingMap: Record<(typeof dayOrder)[number], string> = {
    lunes: "Lunes",
    martes: "Martes",
    miercoles: "Miercoles",
    jueves: "Jueves",
    viernes: "Viernes",
    sabado: "Sabado",
    domingo: "Domingo"
  }

  const sections = [
    `## ${draft.title}`,
    draft.plan.weekGoal ? `**Objetivo semanal:** ${draft.plan.weekGoal}` : null,
    draft.plan.notes ? `**Notas:** ${draft.plan.notes}` : null,
    ...dayOrder.map((dayKey) => {
      const day = draft.plan.days[dayKey]
      const meals = day.meals
        .map((meal) => `- **${meal.title}:** ${meal.detail}`)
        .join("\n")

      return [
        `### ${headingMap[dayKey]}`,
        day.focus ? `Enfoque: ${day.focus}` : null,
        meals
      ].filter(Boolean).join("\n")
    }),
    draft.plan.shoppingList.length
      ? [
          "### Lista de compra",
          ...draft.plan.shoppingList.map((item) => `- ${item}`)
        ].join("\n")
      : null
  ].filter(Boolean)

  return sections.join("\n\n")
}

function streamTextAsChunks(
  send: (payload: Record<string, unknown>) => void,
  content: string,
  chunkSize = 180
) {
  for (let index = 0; index < content.length; index += chunkSize) {
    send({
      type: "chunk",
      content: content.slice(index, index + chunkSize)
    })
  }
}

async function maybeRunNutritionMemoryTools(
  aiClient: any,
  accessToken: string,
  conversation: PortalNutritionData,
  authUserId: string,
  userMessage: string
) {
  if (!shouldAttemptMemoryToolPass(userMessage)) {
    return conversation
  }

  const response = await aiClient.ai.chat.completions.create({
    model: nutritionAssistantConfig.modelId,
    messages: [
      ...buildAssistantContext(conversation),
      {
        role: "system",
      content: [
          "Usa herramientas solo si necesitas leer o guardar memoria del cliente.",
          "Si no hace falta ninguna herramienta, responde exactamente NO_TOOL."
        ].join(" ")
      }
    ],
    tools: nutritionMemoryToolDefinitions,
    toolChoice: "auto",
    parallelToolCalls: false,
    temperature: 0,
    maxTokens: 500
  })

  const toolCalls = (response?.choices?.[0]?.message?.tool_calls ?? []) as ToolCall[]

  if (!toolCalls.length) {
    return conversation
  }

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name ?? ""
    const args = parseToolArguments(toolCall.function?.arguments)

    if (toolName === "read_nutrition_memory") {
      continue
    }

    if (toolName === "update_nutrition_memory") {
      await updatePortalNutritionMemory(accessToken, args)
      continue
    }
  }

  return loadPortalNutritionConversation(
    accessToken,
    conversation.client.id,
    conversation.threadId,
    authUserId
  )
}

async function trySaveWeeklyPlanFromContent(
  aiClient: any,
  accessToken: string,
  conversation: PortalNutritionData,
  userMessage: string,
  content: string,
  mealsPerDay: number
) {
  try {
    const extractedDraft = await extractWeeklyPlanDraftFromContent(
      aiClient,
      content,
      mealsPerDay
    )

    await saveWeeklyPlanDraft(accessToken, extractedDraft)
    return true
  } catch {
    try {
      const fallbackDraft = await generateWeeklyPlanDraft(
        aiClient,
        conversation,
        userMessage,
        mealsPerDay
      )

      await saveWeeklyPlanDraft(accessToken, fallbackDraft)
      return true
    } catch {
      return false
    }
  }
}

async function maybeRefreshRollingSummary(
  aiClient: any,
  accessToken: string,
  conversation: PortalNutritionData,
  finalMessages: NutritionChatMessage[]
) {
  if (!shouldRefreshRollingSummary(conversation.memory, finalMessages)) {
    return
  }

  const summaryResponse = await aiClient.ai.chat.completions.create({
    model: nutritionAssistantConfig.modelId,
    messages: [
      {
        role: "system",
        content: [
          "Resume la conversacion nutricional para contexto futuro.",
          "Incluye objetivo, habitos, restricciones, preferencias, progreso y cualquier accion pendiente.",
          "Maximo 6 frases cortas y sin diagnosticos."
        ].join(" ")
      },
      {
        role: "system",
        content: `Resumen previo: ${conversation.memory.rollingSummary ?? "Sin resumen previo."}`
      },
      {
        role: "system",
        content: `Memoria nutricional actual:\n${buildNutritionMemoryBlock(conversation.memory)}`
      },
      ...finalMessages.slice(-24).map((message) => ({
        role: message.role,
        content: message.content
      }))
    ],
    temperature: 0.2,
    maxTokens: 220
  })

  const summaryText = String(summaryResponse?.choices?.[0]?.message?.content ?? "").trim()

  if (!summaryText) {
    return
  }

  await refreshPortalNutritionSummary(accessToken, {
    summary: summaryText,
    rollingSummaryMessageCount: finalMessages.length,
    modelId: nutritionAssistantConfig.modelId
  })
}

export async function POST(request: Request) {
  const portalAccount = await getCurrentPortalAccount()
  const accessToken = await getCurrentPortalAccessToken()

  if (!portalAccount || !accessToken) {
    return Response.json(
      { message: "Sesion de portal no valida." },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const userMessage = typeof body?.message === "string" ? body.message.trim() : ""

  if (!userMessage) {
    return Response.json(
      { message: "Escribe un mensaje para hablar con nutricion." },
      { status: 400 }
    )
  }

  const persistedUser = await appendPortalNutritionMessage(accessToken, {
    role: "user",
    content: userMessage,
    metadata: {
      source: "client_portal",
      assistantConfigId: nutritionAssistantConfig.id
    }
  }).catch((error: Error) => ({ error }))

  if ("error" in persistedUser) {
    const quota = await getPortalNutritionQuotaStatus(accessToken, portalAccount.authUserId).catch(() => null)
    const message = persistedUser.error.message
    const status = /limite diario|limite mensual/i.test(message) ? 429 : 400

    return Response.json(
      { message, quota },
      { status }
    )
  }

  const threadId = String(persistedUser.thread_id ?? persistedUser.threadId ?? "")
  const aiClient = createServerInsforgeClient({ accessToken }) as any
  const refusalType = classifyNutritionPrompt(userMessage)
  const weeklyMenuRequested = isWeeklyMenuRequest(userMessage)
  const weeklyPlanRequested = isWeeklyPlanSaveRequest(userMessage)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        let conversation = await loadPortalNutritionConversation(
          accessToken,
          portalAccount.clientId,
          threadId,
          portalAccount.authUserId
        )
        const mealsPerDay = resolveRequestedMealsPerDay(userMessage, conversation.memory)

        if (refusalType) {
          const refusal = getNutritionRefusalMessage(refusalType)
          const persistedAssistant = await appendPortalNutritionMessage(accessToken, {
            role: "assistant",
            content: refusal,
            modelId: nutritionAssistantConfig.modelId,
            metadata: {
              source: "client_portal",
              assistantConfigId: nutritionAssistantConfig.id,
              refusalType
            }
          })

          send({
            type: "complete",
            threadId,
            quota: persistedUser.quota,
            userMessage: toClientMessage(persistedUser.message),
            assistantMessage: toClientMessage(persistedAssistant.message)
          })
          return
        }

        conversation = await maybeRunNutritionMemoryTools(
          aiClient,
          accessToken,
          conversation,
          portalAccount.authUserId,
          userMessage
        )
        const previousAssistantMenu = !weeklyMenuRequested && weeklyPlanRequested
          ? findLastAssistantMenuContent(conversation.messages)
          : null

        if (weeklyPlanRequested && !weeklyMenuRequested) {
          const saved = previousAssistantMenu
            ? await trySaveWeeklyPlanFromContent(
                aiClient,
                accessToken,
                conversation,
                userMessage,
                previousAssistantMenu,
                mealsPerDay
              )
            : false

          const confirmation = saved
            ? "He guardado el ultimo menu semanal en tus planes guardados."
            : "No he encontrado un menu semanal reciente y completo para guardarlo. Pidemelo de nuevo junto con el menu y lo dejo guardado al terminar."

          const persistedAssistant = await appendPortalNutritionMessage(accessToken, {
            role: "assistant",
            content: confirmation,
            modelId: nutritionAssistantConfig.modelId,
            metadata: {
              source: "client_portal",
              assistantConfigId: nutritionAssistantConfig.id,
              streamed: false,
              savedWeeklyPlan: saved
            }
          })

          const assistantMessage = toClientMessage(persistedAssistant.message)
          await maybeRefreshRollingSummary(aiClient, accessToken, conversation, [
            ...conversation.messages,
            assistantMessage
          ])

          send({
            type: "complete",
            threadId,
            quota: persistedUser.quota,
            userMessage: toClientMessage(persistedUser.message),
            assistantMessage
          })
          return
        }

        let finalContent = ""

        if (weeklyMenuRequested) {
          const draft = await generateWeeklyPlanDraft(
            aiClient,
            conversation,
            userMessage,
            mealsPerDay
          )

          finalContent = buildWeeklyPlanMarkdown(draft)

          let saved = false
          if (weeklyPlanRequested) {
            try {
              await saveWeeklyPlanDraft(accessToken, draft)
              saved = true
            } catch {
              saved = false
            }

            finalContent = `${finalContent}${buildWeeklyPlanSavedNote(saved)}`
          }

          streamTextAsChunks(send, finalContent)
        } else {
          const completion = await aiClient.ai.chat.completions.create({
            model: nutritionAssistantConfig.modelId,
            messages: buildAssistantContext(conversation),
            temperature: 0.35,
            maxTokens: 700,
            stream: true
          })

          let responseText = ""

          for await (const chunk of completion) {
            const delta = chunk?.choices?.[0]?.delta?.content

            if (typeof delta === "string" && delta.length > 0) {
              responseText += delta
              send({
                type: "chunk",
                content: delta
              })
            }
          }

          finalContent =
            responseText.trim() ||
            "No he podido responder bien esta vez. Intentalo de nuevo en unos segundos."
        }

        const persistedAssistant = await appendPortalNutritionMessage(accessToken, {
          role: "assistant",
          content: finalContent,
          modelId: nutritionAssistantConfig.modelId,
          metadata: {
            source: "client_portal",
            assistantConfigId: nutritionAssistantConfig.id,
            streamed: true
          }
        })

        const assistantMessage = toClientMessage(persistedAssistant.message)
        await maybeRefreshRollingSummary(aiClient, accessToken, conversation, [
          ...conversation.messages,
          assistantMessage
        ])

        send({
          type: "complete",
          threadId,
          quota: persistedUser.quota,
          userMessage: toClientMessage(persistedUser.message),
          assistantMessage
        })
      } catch (error) {
        const quota = await getPortalNutritionQuotaStatus(accessToken, portalAccount.authUserId).catch(() => null)
        send({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo completar la respuesta nutricional.",
          quota
        })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  })
}
