// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function normalizeReminderType(reminderType: string) {
  if (reminderType === "expiry_reminder_d7" || reminderType === "pass_expiry_d7") return "pass_expiry_d7"
  if (reminderType === "expiry_reminder_d0" || reminderType === "pass_expiry_d0") return "pass_expiry_d0"
  return ""
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
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede lanzar emails de caducidad" }, 403) }
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
    const eventType = normalizeReminderType(String(body?.reminderType ?? ""))
    if (!body?.passId || !eventType) {
      return json({ code: "INVALID_INPUT", message: "Pass y reminderType son obligatorios" }, 400)
    }

    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const [passResult, holdersResult] = await Promise.all([
      client.database.from("passes").select("id,pass_type_id,expires_on,sessions_left").eq("id", body.passId).maybeSingle(),
      client.database.from("pass_holders").select("client_id").eq("pass_id", body.passId)
    ])

    if (passResult.error || !passResult.data) {
      return json({ code: "NOT_FOUND", message: "Bono no encontrado" }, 404)
    }

    const holderIds = (holdersResult.data ?? []).map((holder) => String(holder.client_id))
    if (!holderIds.length) {
      return json({ ok: true, skipped: true, reason: "no_holders" })
    }

    const passTypeResult = await client.database
      .from("pass_types")
      .select("name")
      .eq("id", passResult.data.pass_type_id)
      .maybeSingle()

    const sendResult = await client.functions.invoke("send_client_communication", {
      body: {
        clientIds: holderIds,
        passId: passResult.data.id,
        eventType,
        channels: ["email"],
        dedupeSeed: `${passResult.data.id}:${passResult.data.expires_on}`,
        templateData: {
          passTypeName: passTypeResult.data?.name ?? "Bono",
          expiresOn: passResult.data.expires_on,
          sessionsLeft: passResult.data.sessions_left
        }
      }
    })

    if (sendResult.error) {
      return json({ code: "SEND_FAILED", message: sendResult.error.message }, 400)
    }

    return json(sendResult.data ?? { ok: true })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
