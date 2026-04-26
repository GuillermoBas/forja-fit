// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

async function getActor(client: any) {
  const authResult = await client.auth.getCurrentUser()
  if (authResult.error || !authResult.data?.user) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
  }

  const profileResult = await client.database
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authResult.data.user.id)
    .maybeSingle()

  if (profileResult.error || !profileResult.data) {
    return { error: json({ code: "PROFILE_REQUIRED", message: "Perfil no encontrado" }, 403) }
  }

  if (profileResult.data.role !== "admin") {
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede cambiar el estado del portal" }, 403) }
  }

  return { profile: profileResult.data }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : ""
    const status = typeof body?.status === "string" ? body.status.trim() : ""

    if (!clientId) {
      return json({ code: "INVALID_INPUT", message: "El cliente es obligatorio" }, 400)
    }

    if (status !== "claimed" && status !== "disabled") {
      return json({ code: "INVALID_INPUT", message: "El estado solicitado no es valido" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const portalAccountResult = await client.database
      .from("client_portal_accounts")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle()

    if (portalAccountResult.error) {
      return json({ code: "LOOKUP_FAILED", message: portalAccountResult.error.message ?? "No se pudo revisar la cuenta del portal." }, 400)
    }

    if (!portalAccountResult.data) {
      return json({ code: "PORTAL_NOT_FOUND", message: "Este cliente todavia no ha reclamado una cuenta de portal." }, 404)
    }

    const updateResult = await client.database
      .from("client_portal_accounts")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", portalAccountResult.data.id)
      .select("*")
      .maybeSingle()

    if (updateResult.error || !updateResult.data) {
      return json({ code: "UPDATE_FAILED", message: updateResult.error?.message ?? "No se pudo actualizar el estado del portal." }, 400)
    }

    const auditInsert = await client.database.from("audit_logs").insert([
      {
        actor_profile_id: actor.profile.id,
        entity_name: "client_portal_accounts",
        entity_id: portalAccountResult.data.id,
        action: "update",
        diff: {
          source: "staff_app",
          client_id: clientId,
          previous_status: portalAccountResult.data.status,
          next_status: status
        }
      }
    ])

    if (auditInsert.error) {
      return json({ code: "AUDIT_LOG_FAILED", message: auditInsert.error.message ?? "No se pudo registrar la auditoria del estado del portal." }, 400)
    }

    return json({
      ok: true,
      portalAccount: updateResult.data
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
