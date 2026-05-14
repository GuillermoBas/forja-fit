import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type {
  CalendarStatus,
  NotificationChannel,
  NotificationLogItem,
  NotificationType,
  Pass,
  PaymentMethod
} from "@/types/domain"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const nativeSelectClassName =
  "h-11 w-full rounded-xl border border-input bg-card pl-3.5 pr-10 text-sm text-text-primary shadow-[0_1px_2px_rgba(15,23,42,0.02)] transition-all duration-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/15 focus:ring-offset-0 sm:h-12 sm:pl-4 sm:pr-11"

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR"
  }).format(value)
}

export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeZone: process.env.APP_TIMEZONE ?? "Europe/Madrid"
  }).format(typeof value === "string" ? new Date(value) : value)
}

export function formatPaymentMethod(value: PaymentMethod | string) {
  switch (value) {
    case "cash":
      return "Efectivo"
    case "card":
      return "Tarjeta"
    case "transfer":
      return "Transferencia"
    case "bizum":
      return "Bizum"
    default:
      return String(value)
  }
}

export function formatPassStatus(value: Pass["status"] | string) {
  switch (value) {
    case "active":
      return "Activo"
    case "paused":
      return "Pausado"
    case "out_of_sessions":
      return "Sin sesiones"
    case "expired":
      return "Caducado"
    case "cancelled":
      return "Cancelado"
    default:
      return String(value)
  }
}

export function getEffectivePassStatus(
  pass: Pick<Pass, "status" | "expiresOn" | "passKind" | "sessionsLeft" | "pauseStartsOn" | "pauseEndsOn">,
  _todayKey?: string
): Pass["status"] {
  return pass.status
}

export function formatCalendarStatus(value: CalendarStatus | string) {
  switch (value) {
    case "scheduled":
      return "Programada"
    case "completed":
      return "Consumida"
    case "cancelled":
      return "Cancelada"
    case "no_show":
      return "No asistió"
    default:
      return String(value)
  }
}

export function formatNotificationChannel(value: NotificationChannel | string) {
  switch (value) {
    case "email":
      return "Email"
    case "internal":
      return "Interna"
    case "push":
      return "Push"
    default:
      return String(value)
  }
}

export function formatNotificationStatus(value: NotificationLogItem["status"] | string) {
  switch (value) {
    case "queued":
      return "En cola"
    case "sent":
      return "Enviada"
    case "failed":
      return "Fallida"
    case "skipped":
      return "Omitida"
    default:
      return String(value)
  }
}

export function formatNotificationType(value: NotificationType | string) {
  switch (value) {
    case "renewal_confirmation":
      return "Confirmación de renovación"
    case "expiry_reminder_d7":
      return "Recordatorio D-7"
    case "expiry_reminder_d0":
      return "Recordatorio D-0"
    case "manual_note":
      return "Nota manual"
    case "pass_assigned":
      return "Bono asignado"
    case "calendar_session_24h":
      return "Recordatorio de sesión del día"
    case "pass_expiry_d7":
      return "Caducidad de bono D-7"
    case "pass_expiry_d0":
      return "Caducidad de bono D-0"
    default:
      return String(value)
  }
}
