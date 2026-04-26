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

  return { profile: profileResult.data }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    if (!body?.firstName || !body?.lastName) {
      return json({ code: "INVALID_INPUT", message: "Nombre y apellidos son obligatorios" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await client.database.rpc("app_upsert_client", {
      p_actor_profile_id: actor.profile.id,
      p_client_id: body.id ?? null,
      p_first_name: body.firstName,
      p_last_name: body.lastName,
      p_email: body.email ?? "",
      p_phone: body.phone ?? "",
      p_tax_id: body.taxId ?? "",
      p_notes: body.notes ?? "",
      p_is_active: body.isActive ?? true
    })

    if (rpcResult.error) {
      return json({ code: "DB_ERROR", message: rpcResult.error.message }, 400)
    }

    return json({ ok: true, clientId: rpcResult.data })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
