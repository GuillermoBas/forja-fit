import { addDays, format, startOfWeek, subDays } from "date-fns"
import type { Client, ClientPortalAccountSummary } from "@/types/domain"
import type {
  ClientCalendarSession,
  PortalActivityRange,
  PortalDashboardData
} from "@/features/client-portal/data"
import type {
  NutritionMemory,
  NutritionQuotaStatus,
  PortalNutritionData,
  WeeklyNutritionPlan
} from "@/features/client-portal/nutrition/server"
import { nutritionAssistantConfig } from "@/features/client-portal/nutrition/config"

const previewClient: Client = {
  id: "preview-client-guillermo",
  fullName: "Guillermo Bas Portal",
  firstName: "Guillermo",
  lastName: "Bas Portal",
  email: "guillermo.preview@trainium.local",
  phone: "600123123",
  notes: "Cliente de preview visual local",
  isActive: true
}

const previewPortalAccount: ClientPortalAccountSummary = {
  id: "preview-portal-account",
  clientId: previewClient.id,
  authUserId: "preview-portal-auth-user",
  email: previewClient.email ?? "cliente.preview@trainium.local",
  status: "claimed",
  primaryProvider: "password",
  claimedAt: subDays(new Date(), 20).toISOString(),
  lastLoginAt: new Date().toISOString()
}

const previewQuota: NutritionQuotaStatus = {
  dailyUsed: 3,
  dailyLimit: 20,
  dailyRemaining: 17,
  monthlyUsed: 11,
  monthlyLimit: 300,
  monthlyRemaining: 289,
  blocked: false
}

const previewMemory: NutritionMemory = {
  heightCm: 178,
  weightKg: 78,
  goal: "Ganar fuerza manteniendo energía para entrenar",
  mealsPerDay: 4,
  dietaryPattern: "Mediterranea flexible",
  intermittentFasting: false,
  allergies: null,
  intolerances: "Lactosa ocasional",
  foodsToAvoid: "Picante fuerte",
  preferredFoods: "Arroz, huevos, pescado, verduras y fruta",
  usualSchedule: "Entrena por la tarde, cena temprano",
  rollingSummary: "Cliente en fase de preview con objetivos de fuerza y adherencia semanal.",
  rollingSummaryMessageCount: 4,
  rollingSummaryRefreshedAt: subDays(new Date(), 1).toISOString(),
  rollingSummaryModelId: nutritionAssistantConfig.modelId
}

function toIsoDay(date: Date) {
  return format(date, "yyyy-MM-dd")
}

function parseRange(value?: string): PortalActivityRange {
  const parsed = Number(value)
  return parsed === 90 || parsed === 180 || parsed === 365 ? parsed : 30
}

export function getPreviewPortalAccount() {
  return previewPortalAccount
}

export function getPreviewPortalDashboardData(rangeParam?: string): PortalDashboardData {
  const today = new Date()
  const rangeDays = parseRange(rangeParam)
  const chart = Array.from({ length: 8 }, (_, index) => ({
    label: `S${index + 1}`,
    value: [2, 3, 1, 4, 3, 2, 4, 3][index] ?? 0
  }))

  return {
    client: previewClient,
    rangeDays,
    availableRanges: [30, 90, 180, 365],
    kpis: {
      sessionsLast30Days: 13,
      currentStreakWeeks: 5,
      monthlyConsistency: {
        activeWeeks: 4,
        elapsedWeeks: 4,
        ratio: 1
      },
      sessionsRemaining: 7,
      daysUntilNearestExpiry: 12,
      monthOverMonthDelta: 3
    },
    chart,
    history: [
      {
        id: "preview-history-1",
        kind: "session",
        happenedAt: subDays(today, 2).toISOString(),
        title: "Sesión consumida",
        detail: "Bono 10 sesiones"
      },
      {
        id: "preview-history-2",
        kind: "renewal",
        happenedAt: subDays(today, 9).toISOString(),
        title: "Renovación registrada",
        detail: "Confirmacion interna generada"
      },
      {
        id: "preview-history-3",
        kind: "pause",
        happenedAt: subDays(today, 16).toISOString(),
        title: "Pausa aplicada",
        detail: "Pausa de 4 días"
      }
    ],
    activePasses: [
      {
        id: "preview-pass-1",
        passTypeName: "Bono 10 sesiones",
        passKind: "session",
        status: "active",
        expiresOn: toIsoDay(addDays(today, 12)),
        sessionsLeft: 7,
        holderSummary: "Titular único"
      },
      {
        id: "preview-pass-2",
        passTypeName: "Mensual",
        passKind: "monthly",
        status: "active",
        expiresOn: toIsoDay(addDays(today, 22)),
        sessionsLeft: null,
        holderSummary: "Compartido con Otro titular"
      }
    ]
  }
}

export function getPreviewClientCalendarSessions(): ClientCalendarSession[] {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })

  return [
    {
      id: "preview-calendar-1",
      startsAt: addDays(weekStart, 1).toISOString(),
      endsAt: new Date(addDays(weekStart, 1).getTime() + 60 * 60 * 1000).toISOString(),
      durationMin: 60,
      status: "scheduled",
      trainerName: "Admin Trainium",
      isShared: false,
      displayTitle: "Entrenamiento personal",
      canCancel: true,
      cancellationReason: null
    },
    {
      id: "preview-calendar-2",
      startsAt: addDays(weekStart, 3).toISOString(),
      endsAt: new Date(addDays(weekStart, 3).getTime() + 60 * 60 * 1000).toISOString(),
      durationMin: 60,
      status: "scheduled",
      trainerName: "Admin Trainium",
      isShared: true,
      displayTitle: "Sesión compartida",
      canCancel: true,
      cancellationReason: null
    },
    {
      id: "preview-calendar-3",
      startsAt: subDays(new Date(), 3).toISOString(),
      endsAt: new Date(subDays(new Date(), 3).getTime() + 60 * 60 * 1000).toISOString(),
      durationMin: 60,
      status: "completed",
      trainerName: "Admin Trainium",
      isShared: false,
      displayTitle: "Sesión completada",
      canCancel: false,
      cancellationReason: "Esta sesión ya no permite cancelación."
    }
  ]
}

function getPreviewWeeklyPlan(): WeeklyNutritionPlan {
  return {
    id: "preview-weekly-plan",
    title: "Menú semanal de preview",
    weekStartsOn: toIsoDay(startOfWeek(new Date(), { weekStartsOn: 1 })),
    generatedByModel: nutritionAssistantConfig.modelId,
    createdAt: subDays(new Date(), 1).toISOString(),
    plan: {
      weekGoal: "Mantener energía estable para entrenar fuerza.",
      notes: "Preview local para comprobar el render de planes guardados.",
      shoppingList: ["Arroz integral", "Huevos", "Pollo", "Yogur natural", "Verduras", "Fruta"],
      days: {
        lunes: { focus: "Fuerza", meals: [{ title: "Comida", detail: "Arroz con pollo y verduras" }] },
        martes: { focus: "Recuperación", meals: [{ title: "Cena", detail: "Tortilla con ensalada" }] },
        miercoles: { focus: "Entreno", meals: [{ title: "Merienda", detail: "Yogur con fruta" }] },
        jueves: { focus: "Base", meals: [{ title: "Comida", detail: "Legumbre con arroz" }] },
        viernes: { focus: "Fuerza", meals: [{ title: "Cena", detail: "Pescado con patata" }] },
        sabado: { focus: "Flexible", meals: [{ title: "Comida", detail: "Bowl mediterráneo" }] },
        domingo: { focus: "Preparación", meals: [{ title: "Cena", detail: "Crema de verduras y huevos" }] }
      }
    }
  }
}

export function getPreviewPortalNutritionData(): PortalNutritionData {
  return {
    client: previewClient,
    threadId: "preview-thread",
    assistantConfigId: nutritionAssistantConfig.id,
    memory: previewMemory,
    quota: previewQuota,
    recentTrainingSummary: "3 sesiones en los últimos 14 días, con buena regularidad semanal.",
    savedPlans: [getPreviewWeeklyPlan()],
    messages: [
      {
        id: "preview-message-1",
        threadId: "preview-thread",
        clientId: previewClient.id,
        role: "assistant",
        content:
          "Soy tu asistente de nutrición de Trainium. En preview puedo ayudarte a comprobar el diseño del chat sin llamar al modelo real.",
        modelId: nutritionAssistantConfig.modelId,
        createdAt: subDays(new Date(), 2).toISOString(),
        metadata: { preview: true }
      },
      {
        id: "preview-message-2",
        threadId: "preview-thread",
        clientId: previewClient.id,
        role: "user",
        content: "Quiero organizar mejor mis comidas para entrenar por la tarde.",
        modelId: null,
        createdAt: subDays(new Date(), 1).toISOString(),
        metadata: { preview: true }
      },
      {
        id: "preview-message-3",
        threadId: "preview-thread",
        clientId: previewClient.id,
        role: "assistant",
        content:
          "Perfecto. Para entrenar por la tarde, prioriza una comida principal completa y una merienda ligera con carbohidrato y proteína.",
        modelId: nutritionAssistantConfig.modelId,
        createdAt: new Date().toISOString(),
        metadata: { preview: true }
      }
    ]
  }
}

export function getPreviewPortalPushSettingsData() {
  return {
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    preferences: {
      passExpiryEnabled: true,
      passAssignedEnabled: true,
      sessionRemindersEnabled: true
    }
  }
}

export function getPreviewChatResponse(userMessage: string) {
  const now = new Date().toISOString()

  return {
    threadId: "preview-thread",
    quota: {
      ...previewQuota,
      dailyUsed: previewQuota.dailyUsed + 1,
      dailyRemaining: previewQuota.dailyRemaining - 1,
      monthlyUsed: previewQuota.monthlyUsed + 1,
      monthlyRemaining: previewQuota.monthlyRemaining - 1
    },
    userMessage: {
      id: `preview-user-${Date.now()}`,
      threadId: "preview-thread",
      clientId: previewClient.id,
      role: "user" as const,
      content: userMessage,
      modelId: null,
      createdAt: now,
      metadata: { preview: true }
    },
    assistantMessage: {
      id: `preview-assistant-${Date.now()}`,
      threadId: "preview-thread",
      clientId: previewClient.id,
      role: "assistant" as const,
      content:
        "Respuesta de preview: mantén una comida completa 3-4 horas antes de entrenar y una merienda sencilla si llegas con hambre.",
      modelId: nutritionAssistantConfig.modelId,
      createdAt: now,
      metadata: { preview: true }
    }
  }
}
