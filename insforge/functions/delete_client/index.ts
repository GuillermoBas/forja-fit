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
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede borrar clientes" }, 403) }
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
    const gymId = String(body?.gymId ?? "")
    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }
    if (!body?.clientId) {
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

    const [passesResult, salesResult, notificationsResult, calendarResult] = await Promise.all([
      Promise.all([
        client.database
          .from("pass_holders")
          .select("id", { count: "exact" })
          .eq("gym_id", gymId)
          .eq("client_id", body.clientId),
        client.database
          .from("passes")
          .select("id", { count: "exact" })
          .eq("gym_id", gymId)
          .eq("purchased_by_client_id", body.clientId)
      ]),
      client.database
        .from("sales")
        .select("id", { count: "exact" })
        .eq("gym_id", gymId)
        .eq("client_id", body.clientId),
      client.database
        .from("notification_log")
        .select("id", { count: "exact" })
        .eq("gym_id", gymId)
        .eq("client_id", body.clientId),
      client.database
        .from("calendar_sessions")
        .select("id", { count: "exact" })
        .eq("gym_id", gymId)
        .or(`client_1_id.eq.${body.clientId},client_2_id.eq.${body.clientId}`)
    ])

    const passRelationCount = (passesResult[0].count ?? 0) + (passesResult[1].count ?? 0)

    if (passRelationCount > 0) {
      return json({
        code: "CLIENT_HAS_PASSES",
        message: "No se puede borrar el cliente porque tiene bonos asociados"
      })
    }

    if ((salesResult.count ?? 0) > 0) {
      return json({
        code: "CLIENT_HAS_SALES",
        message: "No se puede borrar el cliente porque tiene ventas asociadas"
      })
    }

    if ((notificationsResult.count ?? 0) > 0) {
      return json({
        code: "CLIENT_HAS_NOTIFICATIONS",
        message: "No se puede borrar el cliente porque tiene notificaciones asociadas"
      })
    }

    if ((calendarResult.count ?? 0) > 0) {
      return json({
        code: "CLIENT_HAS_CALENDAR",
        message: "No se puede borrar el cliente porque tiene sesiones de agenda asociadas"
      })
    }

    const rpcResult = await client.database.rpc("app_delete_client", {
      p_actor_profile_id: actor.profile.id,
      p_client_id: body.clientId
    })

    if (rpcResult.error) {
      return json({ code: "DB_ERROR", message: rpcResult.error.message || "No se pudo borrar el cliente" }, 400)
    }

    return json({
      ok: true,
      clientId: rpcResult.data ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
