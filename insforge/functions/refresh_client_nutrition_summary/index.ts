// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"

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
    const summary = typeof body?.summary === "string" ? body.summary.trim() : ""
    const messageCount =
      typeof body?.rollingSummaryMessageCount === "number" && Number.isInteger(body.rollingSummaryMessageCount)
        ? body.rollingSummaryMessageCount
        : -1
    const modelId = typeof body?.modelId === "string" ? body.modelId.trim() : null

    if (!summary || summary.length > 2000) {
      return json({ code: "INVALID_SUMMARY", message: "El resumen acumulado no es valido." }, 400)
    }

    if (messageCount < 0) {
      return json({ code: "INVALID_MESSAGE_COUNT", message: "El contador de resumen no es valido." }, 400)
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
      .maybeSingle()

    if (portalAccountResult.error || !portalAccountResult.data) {
      return json({ code: "PORTAL_ACCOUNT_REQUIRED", message: "No hay acceso al portal asociado a este usuario." }, 403)
    }

    const ensureResult = await client.database.rpc("app_ensure_client_nutrition_thread", {
      p_auth_user_id: authResult.data.user.id
    })

    if (ensureResult.error || !ensureResult.data?.nutrition_profile_id) {
      return json({ code: "NUTRITION_PROFILE_REQUIRED", message: ensureResult.error?.message ?? "No se pudo preparar el perfil nutricional." }, 400)
    }

    const updateResult = await client.database
      .from("client_nutrition_profiles")
      .update({
        rolling_summary: summary,
        rolling_summary_message_count: messageCount,
        rolling_summary_refreshed_at: new Date().toISOString(),
        rolling_summary_model_id: modelId || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", ensureResult.data.nutrition_profile_id)
      .select("*")
      .maybeSingle()

    if (updateResult.error || !updateResult.data) {
      return json({ code: "SUMMARY_UPDATE_FAILED", message: updateResult.error?.message ?? "No se pudo actualizar el resumen acumulado." }, 400)
    }

    const auditInsert = await client.database.from("audit_logs").insert([
      {
        actor_profile_id: null,
        entity_name: "client_nutrition_profiles",
        entity_id: updateResult.data.id,
        action: "update",
        diff: {
          source: "client_portal",
          rolling_summary_message_count: messageCount,
          rolling_summary_model_id: modelId || null
        }
      }
    ])

    if (auditInsert.error) {
      return json({ code: "AUDIT_LOG_FAILED", message: auditInsert.error.message ?? "No se pudo registrar la auditoria del resumen." }, 400)
    }

    return json({
      ok: true,
      profile: updateResult.data
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
