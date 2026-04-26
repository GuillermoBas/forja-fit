"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"

export type NotificationActionState = {
  error?: string
}

export async function createInternalNotificationAction(
  _prevState: NotificationActionState,
  formData: FormData
): Promise<NotificationActionState> {
  try {
    await invokeProtectedFunction("create_internal_notification", {
      clientId: String(formData.get("clientId") ?? "").trim() || undefined,
      eventType: "manual_note",
      recipient: "staff",
      subject: String(formData.get("subject") ?? "").trim(),
      body: String(formData.get("body") ?? "").trim(),
      payload: {
        source: "notifications_ui"
      }
    })
  } catch (error) {
    return toActionError(error, "No se pudo crear la notificación")
  }

  revalidatePath("/notifications")
  revalidatePath("/dashboard")
  redirect("/notifications")
}

export async function runDailyExpiryScanAction(
  _prevState: NotificationActionState,
  formData: FormData
): Promise<NotificationActionState> {
  try {
    await invokeProtectedFunction("run_daily_expiry_scan", {
      runOn: String(formData.get("runOn") ?? "").trim() || undefined
    })
  } catch (error) {
    return toActionError(error, "No se pudo ejecutar el job diario")
  }

  revalidatePath("/notifications")
  revalidatePath("/dashboard")
  redirect("/notifications")
}
