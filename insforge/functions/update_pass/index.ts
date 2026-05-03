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
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede editar bonos" }, 403) }
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
    const holderClientIds = Array.isArray(body?.holderClientIds)
      ? body.holderClientIds.filter((value: unknown) => typeof value === "string" && value)
      : []

    if (!body?.passId || !body?.passTypeId || holderClientIds.length < 1 || !body?.contractedOn) {
      return json({ code: "INVALID_INPUT", message: "Faltan datos obligatorios del bono" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await client.database.rpc("app_update_pass", {
      p_actor_profile_id: actor.profile.id,
      p_pass_id: body.passId,
      p_pass_type_id: body.passTypeId,
      p_holder_client_ids: holderClientIds,
      p_purchased_by_client_id: body.purchasedByClientId ?? holderClientIds[0],
      p_pass_sub_type: body.passSubType ?? "",
      p_contracted_on: body.contractedOn,
      p_status: body.status ?? "active",
      p_sessions_left: body.sessionsLeft === "" || body.sessionsLeft === null || body.sessionsLeft === undefined
        ? null
        : Number(body.sessionsLeft),
      p_notes: body.notes ?? ""
    })

    if (rpcResult.error) {
      return json({ code: "DB_ERROR", message: rpcResult.error.message || "No se pudo actualizar el bono" }, 400)
    }

    return json({
      ok: true,
      passId: rpcResult.data ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
