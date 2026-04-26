"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"
import { fromDateTimeLocalInAppTimeZone } from "@/lib/timezone"

export type CalendarActionState = {
  error?: string
}

function getAgendaReturnTo(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "/agenda")
  return returnTo.startsWith("/agenda") ? returnTo : "/agenda"
}

function normalizeAgendaDateTime(formData: FormData, field: "startsAt" | "endsAt") {
  const value = String(formData.get(field) ?? "").trim()
  return value ? fromDateTimeLocalInAppTimeZone(value) : ""
}

export async function upsertCalendarSessionAction(
  _prevState: CalendarActionState,
  formData: FormData
): Promise<CalendarActionState> {
  try {
    await invokeProtectedFunction("upsert_calendar_session", {
      id: String(formData.get("id") ?? "").trim() || undefined,
      trainerProfileId: String(formData.get("trainerProfileId") ?? "").trim(),
      passIds: formData.getAll("passIds").map((value) => String(value).trim()).filter(Boolean),
      startsAt: normalizeAgendaDateTime(formData, "startsAt"),
      endsAt: normalizeAgendaDateTime(formData, "endsAt"),
      status: String(formData.get("status") ?? "scheduled").trim(),
      notes: String(formData.get("notes") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo guardar la sesion")
  }

  const returnTo = getAgendaReturnTo(formData)
  revalidatePath("/agenda")
  redirect(returnTo)
}

export async function cancelCalendarSessionAction(
  _prevState: CalendarActionState,
  formData: FormData
): Promise<CalendarActionState> {
  try {
    await invokeProtectedFunction("delete_calendar_session", {
      sessionId: String(formData.get("sessionId") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo eliminar la sesion")
  }

  const returnTo = getAgendaReturnTo(formData)
  revalidatePath("/agenda")
  redirect(returnTo)
}
