// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const gymId = String(body?.gymId ?? "")
    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const authResult = await client.auth.getCurrentUser()
    if (authResult.error || !authResult.data?.user?.id) {
      return json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401)
    }

    const portalAccountResult = await client.database
      .from("client_portal_accounts")
      .select("*")
      .eq("auth_user_id", authResult.data.user.id)
      .eq("gym_id", gymId)
      .maybeSingle()

    if (portalAccountResult.error || !portalAccountResult.data) {
      return json({ code: "PORTAL_ACCOUNT_REQUIRED", message: "No hay acceso al portal asociado a este usuario." }, 403)
    }

    const threadResult = await client.database
      .from("nutrition_threads")
      .select("id")
      .eq("gym_id", gymId)
      .eq("client_id", portalAccountResult.data.client_id)

    if (threadResult.error) {
      return json({ code: "THREAD_LOOKUP_FAILED", message: threadResult.error.message ?? "No se pudo revisar el chat nutricional." }, 400)
    }

    const threadIds = (threadResult.data ?? []).map((row) => row.id)

    if (threadIds.length) {
      const usageDelete = await client.database
        .from("nutrition_usage_events")
        .delete()
        .eq("gym_id", gymId)
        .eq("client_id", portalAccountResult.data.client_id)

      if (usageDelete.error) {
        return json({ code: "USAGE_DELETE_FAILED", message: usageDelete.error.message ?? "No se pudo borrar el uso nutricional." }, 400)
      }

      const messagesDelete = await client.database
        .from("nutrition_messages")
        .delete()
        .eq("gym_id", gymId)
        .eq("client_id", portalAccountResult.data.client_id)

      if (messagesDelete.error) {
        return json({ code: "MESSAGES_DELETE_FAILED", message: messagesDelete.error.message ?? "No se pudo borrar el historial nutricional." }, 400)
      }

      const threadDelete = await client.database
        .from("nutrition_threads")
        .delete()
        .eq("gym_id", gymId)
        .eq("client_id", portalAccountResult.data.client_id)

      if (threadDelete.error) {
        return json({ code: "THREAD_DELETE_FAILED", message: threadDelete.error.message ?? "No se pudo reiniciar el chat nutricional." }, 400)
      }
    }

    const profileUpdate = await client.database
      .from("client_nutrition_profiles")
      .update({
        rolling_summary: null,
        rolling_summary_message_count: 0,
        rolling_summary_refreshed_at: null,
        rolling_summary_model_id: null,
        onboarding_status: "pending",
        updated_at: new Date().toISOString()
      })
      .eq("gym_id", gymId)
      .eq("client_id", portalAccountResult.data.client_id)

    if (profileUpdate.error) {
      return json({ code: "PROFILE_RESET_FAILED", message: profileUpdate.error.message ?? "No se pudo limpiar el resumen del chat." }, 400)
    }

    const auditInsert = await client.database.from("audit_logs").insert([{
      gym_id: gymId,
      actor_profile_id: null,
      entity_name: "nutrition_threads",
      entity_id: null,
      action: "nutrition_chat_reset",
      diff: {
        source: "client_portal",
        client_id: portalAccountResult.data.client_id,
        deleted_threads: threadIds.length
      }
    }])

    if (auditInsert.error) {
      return json({ code: "AUDIT_LOG_FAILED", message: auditInsert.error.message ?? "No se pudo registrar la auditoria del reseteo de chat." }, 400)
    }

    return json({ ok: true })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
