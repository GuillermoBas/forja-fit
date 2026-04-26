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
        height_cm: null,
        weight_kg: null,
        goal: null,
        meals_per_day: null,
        dietary_pattern: null,
        intermittent_fasting: null,
        allergies: null,
        intolerances: null,
        foods_to_avoid: null,
        preferred_foods: null,
        usual_schedule: null,
        rolling_summary: null,
        rolling_summary_message_count: 0,
        rolling_summary_refreshed_at: null,
        rolling_summary_model_id: null,
        onboarding_status: "pending",
        updated_at: new Date().toISOString()
      })
      .eq("id", ensureResult.data.nutrition_profile_id)
      .select("*")
      .maybeSingle()

    if (updateResult.error || !updateResult.data) {
      return json({ code: "MEMORY_RESET_FAILED", message: updateResult.error?.message ?? "No se pudo borrar la memoria nutricional." }, 400)
    }

    const auditInsert = await client.database.from("audit_logs").insert([{
      actor_profile_id: null,
      entity_name: "client_nutrition_profiles",
      entity_id: updateResult.data.id,
      action: "nutrition_memory_reset",
      diff: {
        source: "client_portal",
        client_id: portalAccountResult.data.client_id
      }
    }])

    if (auditInsert.error) {
      return json({ code: "AUDIT_LOG_FAILED", message: auditInsert.error.message ?? "No se pudo registrar la auditoria del reseteo de memoria." }, 400)
    }

    return json({ ok: true, profile: updateResult.data })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
