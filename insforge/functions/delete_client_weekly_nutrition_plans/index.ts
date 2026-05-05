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

    const plansResult = await client.database
      .from("weekly_nutrition_plans")
      .select("id")
      .eq("gym_id", gymId)
      .eq("client_id", portalAccountResult.data.client_id)

    if (plansResult.error) {
      return json({ code: "PLANS_LOOKUP_FAILED", message: plansResult.error.message ?? "No se pudieron revisar los planes semanales." }, 400)
    }

    const deletedCount = (plansResult.data ?? []).length

    if (deletedCount > 0) {
      const deleteResult = await client.database
        .from("weekly_nutrition_plans")
        .delete()
        .eq("gym_id", gymId)
        .eq("client_id", portalAccountResult.data.client_id)

      if (deleteResult.error) {
        return json({ code: "PLAN_DELETE_FAILED", message: deleteResult.error.message ?? "No se pudieron borrar los planes semanales." }, 400)
      }
    }

    const auditInsert = await client.database.from("audit_logs").insert([{
      gym_id: gymId,
      actor_profile_id: null,
      entity_name: "weekly_nutrition_plans",
      entity_id: null,
      action: "nutrition_plan_delete",
      diff: {
        source: "client_portal",
        client_id: portalAccountResult.data.client_id,
        deleted_count: deletedCount
      }
    }])

    if (auditInsert.error) {
      return json({ code: "AUDIT_LOG_FAILED", message: auditInsert.error.message ?? "No se pudo registrar la auditoria del borrado de planes." }, 400)
    }

    return json({ ok: true, deletedCount })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
