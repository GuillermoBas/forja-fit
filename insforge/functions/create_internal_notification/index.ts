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
    if (!body?.eventType || !body?.body) {
      return json({ code: "INVALID_INPUT", message: "Faltan datos de la notificacion" }, 400)
    }
    if (!["manual_note", "renewal_confirmation"].includes(String(body.eventType))) {
      return json({ code: "INVALID_INPUT", message: "El tipo de notificacion interna no es valido" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await client.database.rpc("app_create_internal_notification", {
      p_actor_profile_id: actor.profile.id,
      p_client_id: body.clientId ?? null,
      p_pass_id: body.passId ?? null,
      p_sale_id: body.saleId ?? null,
      p_event_type: body.eventType,
      p_recipient: body.recipient ?? "staff",
      p_subject: body.subject ?? "",
      p_body: body.body,
      p_payload: body.payload ?? null
    })

    if (rpcResult.error) {
      return json({ code: "DB_ERROR", message: rpcResult.error.message || "No se pudo crear la notificacion interna" }, 400)
    }

    return json({
      ok: true,
      notificationId: rpcResult.data ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
