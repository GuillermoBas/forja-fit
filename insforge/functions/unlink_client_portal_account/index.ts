// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

async function getActor(client: any, gymId: string) {
  const authResult = await client.auth.getCurrentUser()
  if (authResult.error || !authResult.data?.user) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
  }

  const profileResult = await client.database
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authResult.data.user.id)
    .eq("gym_id", gymId)
    .maybeSingle()

  if (profileResult.error || !profileResult.data) {
    return { error: json({ code: "PROFILE_REQUIRED", message: "Perfil no encontrado" }, 403) }
  }

  if (profileResult.data.role !== "admin") {
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede desvincular el portal" }, 403) }
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
    const gymId = String(body?.gymId ?? "")
    const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : ""

    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    if (!clientId) {
      return json({ code: "INVALID_INPUT", message: "El cliente es obligatorio" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client, gymId)
    if (actor.error) {
      return actor.error
    }

    const portalAccountResult = await client.database
      .from("client_portal_accounts")
      .select("*")
      .eq("gym_id", gymId)
      .eq("client_id", clientId)
      .maybeSingle()

    if (portalAccountResult.error) {
      return json({ code: "LOOKUP_FAILED", message: portalAccountResult.error.message ?? "No se pudo revisar la cuenta del portal." }, 400)
    }

    if (!portalAccountResult.data) {
      return json({ code: "PORTAL_NOT_FOUND", message: "Este cliente no tiene cuenta de portal vinculada." }, 404)
    }

    const deleteResult = await client.database
      .from("client_portal_accounts")
      .delete()
      .eq("id", portalAccountResult.data.id)
      .eq("gym_id", gymId)

    if (deleteResult.error) {
      return json({ code: "UNLINK_FAILED", message: deleteResult.error.message ?? "No se pudo desvincular la cuenta del portal." }, 400)
    }

    const auditInsert = await client.database.from("audit_logs").insert([
      {
        gym_id: gymId,
        actor_profile_id: actor.profile.id,
        entity_name: "client_portal_accounts",
        entity_id: portalAccountResult.data.id,
        action: "delete",
        diff: {
          source: "staff_app",
          client_id: clientId,
          auth_user_id: portalAccountResult.data.auth_user_id,
          email: portalAccountResult.data.email
        }
      }
    ])

    if (auditInsert.error) {
      return json({ code: "AUDIT_LOG_FAILED", message: auditInsert.error.message ?? "No se pudo registrar la auditoria del unlink." }, 400)
    }

    return json({
      ok: true,
      clientId,
      portalAccountId: portalAccountResult.data.id
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
