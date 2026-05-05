import { getSessionContext } from "@/lib/auth/session"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { isStaffPreview } from "@/lib/preview-mode"
import { withGymContext } from "@/lib/tenant"

export type ActionState = {
  error?: string
}

function normalizeActionError(message?: string) {
  const value = String(message ?? "").trim()

  if (!value) {
    return "La operación no se pudo completar."
  }

  if (value.includes("Sesion no valida") || value.includes("UNAUTHORIZED")) {
    return "La sesión ha caducado. Vuelve a iniciar sesión."
  }

  if (value.includes("Perfil no encontrado") || value.includes("PROFILE_REQUIRED")) {
    return "Tu usuario no tiene perfil operativo en la aplicación."
  }

  if (value.includes("FORBIDDEN") || value.includes("Solo admin")) {
    return "No tienes permisos para realizar esta acción."
  }

  if (value.includes("Request failed: Bad Request")) {
    return "La operación fue rechazada por validación. Revisa los datos introducidos."
  }

  return value
}

export async function invokeProtectedFunction(slug: string, body: Record<string, unknown>) {
  if (await isStaffPreview()) {
    return {
      ok: true,
      preview: true,
      saleId: slug === "create_sale" ? "preview-sale" : undefined,
      skipped: slug === "send_push_to_client" ? true : undefined,
      body
    }
  }

  const { accessToken, profile } = await getSessionContext()

  if (!profile || !accessToken) {
    throw new Error("La sesión ha caducado. Vuelve a iniciar sesión.")
  }

  const client = createServerInsforgeClient({ accessToken }) as any
  const result = await client.functions.invoke(slug, { body: await withGymContext(body) })

  if (result.error) {
    throw new Error(normalizeActionError(result.error.message))
  }

  if (result.data?.code) {
    throw new Error(normalizeActionError(result.data.message))
  }

  return result.data
}

export function toActionError(error: unknown, fallbackMessage: string) {
  return {
    error: error instanceof Error ? normalizeActionError(error.message) : fallbackMessage
  }
}
