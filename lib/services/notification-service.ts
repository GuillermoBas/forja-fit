import { createServerInsforgeClient } from "@/lib/insforge/server"

export interface InternalNotificationPayload {
  accessToken: string
  clientId?: string | null
  passId?: string | null
  saleId?: string | null
  title: string
  message: string
  type: "manual_note" | "renewal_confirmation"
  recipient?: string | null
  payload?: Record<string, unknown> | null
}

export interface NotificationService {
  createInternalNotification(payload: InternalNotificationPayload): Promise<{ ok: boolean; notificationId?: string | null }>
}

export class InternalNotificationService implements NotificationService {
  async createInternalNotification(payload: InternalNotificationPayload) {
    const client = createServerInsforgeClient({ accessToken: payload.accessToken }) as any
    const result = await client.functions.invoke("create_internal_notification", {
      body: {
        clientId: payload.clientId ?? undefined,
        passId: payload.passId ?? undefined,
        saleId: payload.saleId ?? undefined,
        eventType: payload.type,
        recipient: payload.recipient ?? "staff",
        subject: payload.title,
        body: payload.message,
        payload: payload.payload ?? null
      }
    })

    if (result.error || result.data?.code) {
      throw new Error(result.error?.message ?? result.data?.message ?? "No se pudo crear la notificación interna")
    }

    return {
      ok: true,
      notificationId: result.data?.notificationId ?? null
    }
  }
}

export function createNotificationService(): NotificationService {
  return new InternalNotificationService()
}
