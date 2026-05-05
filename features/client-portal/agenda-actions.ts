"use server"

import { revalidatePath } from "next/cache"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { getCurrentPortalAccessToken, requirePortalAccount } from "@/lib/auth/portal-session"
import { isClientPreview } from "@/lib/preview-mode"
import { withGymContext } from "@/lib/tenant"

export type PortalAgendaActionState = {
  error?: string
  success?: string
}

function normalizePortalAgendaError(message?: string) {
  const value = String(message ?? "").trim()

  if (!value) {
    return "La operacion no se pudo completar."
  }

  if (value.includes("Sesion no valida") || value.includes("UNAUTHORIZED")) {
    return "La sesion del portal ha caducado. Vuelve a iniciar sesion."
  }

  if (value.includes("PORTAL_ACCOUNT_REQUIRED") || value.includes("No hay acceso al portal asociado")) {
    return "Tu acceso al portal no esta disponible."
  }

  if (value.includes("PORTAL_DISABLED") || value.includes("desactivado")) {
    return "El acceso al portal esta desactivado. Contacta con el gimnasio."
  }

  return value
}

async function invokePortalFunction(slug: string, body: Record<string, unknown>) {
  await requirePortalAccount()
  if (await isClientPreview()) {
    return { ok: true, preview: true, slug, body }
  }

  const accessToken = await getCurrentPortalAccessToken()

  if (!accessToken) {
    throw new Error("La sesion del portal ha caducado. Vuelve a iniciar sesion.")
  }

  const client = createServerInsforgeClient({ accessToken }) as any
  const result = await client.functions.invoke(slug, { body: await withGymContext(body) })

  if (result.error) {
    throw new Error(normalizePortalAgendaError(result.error.message))
  }

  if (result.data?.code) {
    throw new Error(normalizePortalAgendaError(result.data.message))
  }

  return result.data
}

export async function cancelClientCalendarSessionAction(
  _prevState: PortalAgendaActionState,
  formData: FormData
): Promise<PortalAgendaActionState> {
  const calendarSessionId = String(formData.get("calendarSessionId") ?? "").trim()

  if (!calendarSessionId) {
    return { error: "La sesion es obligatoria." }
  }

  try {
    await invokePortalFunction("cancel_client_calendar_session", {
      calendarSessionId
    })
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo cancelar la sesion."
    }
  }

  revalidatePath("/cliente/agenda")
  return { success: "Sesion cancelada correctamente." }
}
