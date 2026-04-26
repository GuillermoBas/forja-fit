"use server"

import { revalidatePath } from "next/cache"
import { getCurrentPortalAccessToken, requirePortalAccount } from "@/lib/auth/portal-session"

export type PortalSettingsState = {
  error?: string
  success?: string
}

export async function updatePortalPhoneAction(
  _prevState: PortalSettingsState,
  formData: FormData
): Promise<PortalSettingsState> {
  await requirePortalAccount()
  const accessToken = await getCurrentPortalAccessToken()
  const phone = String(formData.get("phone") ?? "").trim()
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL

  if (!accessToken || !baseUrl) {
    return { error: "No se ha podido validar la sesion del portal." }
  }

  const response = await fetch(`${baseUrl}/functions/update_client_portal_profile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ phone })
  })

  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null

  if (!response.ok) {
    return {
      error: payload?.message ?? "No se pudo actualizar el telefono."
    }
  }

  revalidatePath("/cliente/ajustes")
  revalidatePath("/cliente/dashboard")

  return {
    success: "Telefono actualizado correctamente."
  }
}

async function callPortalSettingsFunction(
  functionName: string,
  successMessage: string
): Promise<PortalSettingsState> {
  await requirePortalAccount()
  const accessToken = await getCurrentPortalAccessToken()
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL

  if (!accessToken || !baseUrl) {
    return { error: "No se ha podido validar la sesion del portal." }
  }

  const response = await fetch(`${baseUrl}/functions/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  })

  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null

  if (!response.ok) {
    return {
      error: payload?.message ?? "No se pudo completar la accion avanzada."
    }
  }

  revalidatePath("/cliente/ajustes")
  revalidatePath("/cliente/dashboard")
  revalidatePath("/cliente/nutricion")

  return {
    success: successMessage
  }
}

export async function clearPortalNutritionChatAction(
  _prevState: PortalSettingsState
) {
  return callPortalSettingsFunction(
    "reset_client_nutrition_chat",
    "Historial nutricional eliminado correctamente."
  )
}

export async function clearPortalNutritionMemoryAction(
  _prevState: PortalSettingsState
) {
  return callPortalSettingsFunction(
    "reset_client_nutrition_memory",
    "Memoria nutricional eliminada correctamente."
  )
}

export async function deletePortalWeeklyPlansAction(
  _prevState: PortalSettingsState
) {
  return callPortalSettingsFunction(
    "delete_client_weekly_nutrition_plans",
    "Planes semanales eliminados correctamente."
  )
}
