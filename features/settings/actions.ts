"use server"

import { revalidatePath } from "next/cache"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"

export type ManualPushClientOption = {
  id: string
  label: string
}

export type ProfileColorActionState = {
  error?: string
  success?: string
}

export type ManualPushActionState = {
  error?: string
  success?: string
}

export async function updateProfileCalendarColorAction(
  _prevState: ProfileColorActionState,
  formData: FormData
): Promise<ProfileColorActionState> {
  try {
    await invokeProtectedFunction("update_profile_calendar_color", {
      profileId: String(formData.get("profileId") ?? "").trim(),
      calendarColor: String(formData.get("calendarColor") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo guardar el color de agenda")
  }

  revalidatePath("/settings")
  revalidatePath("/agenda")
  return { success: "Color de agenda actualizado correctamente." }
}

export async function sendManualPushAction(
  _prevState: ManualPushActionState,
  formData: FormData
): Promise<ManualPushActionState> {
  const clientId = String(formData.get("clientId") ?? "").trim()
  const url = String(formData.get("url") ?? "").trim()
  const title = String(formData.get("title") ?? "").trim()
  const body = String(formData.get("body") ?? "").trim()

  if (!clientId || !title || !body || !url.startsWith("/")) {
    return {
      error: "Selecciona un cliente y completa título, mensaje y una ruta interna válida."
    }
  }

  try {
    const result = await invokeProtectedFunction("send_push_to_client", {
      clientId,
      eventType: "manual_note",
      dedupeKey: `manual_push:${clientId}:${Date.now()}`,
      title,
      body,
      url
    })

    if (result?.skipped) {
      return {
        success: "Push procesada como omitida. El cliente no tiene suscripciones activas o el portal aún no está listo."
      }
    }
  } catch (error) {
    return toActionError(error, "No se pudo enviar la notificación push manual")
  }

  revalidatePath("/settings")
  return { success: "Notificación push enviada correctamente." }
}
