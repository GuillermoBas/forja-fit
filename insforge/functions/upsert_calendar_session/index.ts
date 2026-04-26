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
    const passIds = Array.isArray(body?.passIds)
      ? body.passIds.map(String).filter(Boolean)
      : []

    if (!body?.trainerProfileId || !passIds.length || !body?.startsAt || !body?.endsAt || !body?.status) {
      return json({ code: "INVALID_INPUT", message: "Faltan datos de la sesion" }, 400)
    }
    if (!["scheduled", "completed", "cancelled", "no_show"].includes(String(body.status))) {
      return json({ code: "INVALID_INPUT", message: "El estado de la sesion no es valido" }, 400)
    }
    if (new Date(String(body.endsAt)).getTime() <= new Date(String(body.startsAt)).getTime()) {
      return json({ code: "INVALID_INPUT", message: "La sesion debe terminar despues de la hora de inicio" }, 400)
    }
    if (
      new Date(String(body.startsAt)).getMinutes() !== 0 ||
      new Date(String(body.endsAt)).getMinutes() !== 0
    ) {
      return json({ code: "INVALID_INPUT", message: "La agenda solo permite horas completas" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await client.database.rpc("app_upsert_calendar_session", {
      p_actor_profile_id: actor.profile.id,
      p_session_id: body.id ?? null,
      p_trainer_profile_id: body.trainerProfileId,
      p_pass_ids: passIds,
      p_starts_at: body.startsAt,
      p_ends_at: body.endsAt,
      p_status: body.status,
      p_notes: body.notes ?? ""
    })

    if (rpcResult.error) {
      const message = String(rpcResult.error.message ?? "")
      return json({ code: "DB_ERROR", message: message || "No se pudo guardar la sesion" }, 400)
    }

    return json({
      ok: true,
      sessionId: rpcResult.data ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
