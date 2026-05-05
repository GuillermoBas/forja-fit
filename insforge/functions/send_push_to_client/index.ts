// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function getToken(request: Request) {
  return request.headers.get("Authorization")?.replace("Bearer ", "") ?? ""
}

function isTrustedToken(token: string) {
  const apiKey = Deno.env.get("API_KEY")
  return Boolean(apiKey && token === apiKey)
}

async function requireStaffActor(client: any, gymId: string) {
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

  return { profile: profileResult.data }
}

const PREFERENCE_BY_EVENT = {
  pass_expiry_d7: "pass_expiry_enabled",
  pass_expiry_d0: "pass_expiry_enabled",
  pass_assigned: "pass_assigned_enabled",
  renewal_confirmation: "pass_assigned_enabled",
  calendar_session_24h: "session_reminders_enabled"
}

export default async function(request: Request) {
  try {
    const token = getToken(request)
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const gymId = String(body?.gymId ?? "")
    const gymSlug = String(body?.gymSlug ?? "eltemplo")
    const clientId = typeof body?.clientId === "string" ? body.clientId : ""
    const eventType = typeof body?.eventType === "string" ? body.eventType : ""
    const preferenceKey = PREFERENCE_BY_EVENT[eventType]

    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    if (!clientId || !body?.dedupeKey || !body?.title || !body?.body) {
      return json({ code: "INVALID_INPUT", message: "Faltan datos para enviar push al cliente" }, 400)
    }

    const trusted = isTrustedToken(token)
    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const actor = trusted ? { profile: { id: null, role: "admin" } } : await requireStaffActor(client, gymId)
    if ("error" in actor) {
      return actor.error
    }

    const existingLog = await client.database
      .from("notification_log")
      .select("id,status")
      .eq("gym_id", gymId)
      .eq("dedupe_key", String(body.dedupeKey))
      .maybeSingle()

    if (!existingLog.error && existingLog.data?.id) {
      return json({ ok: true, skipped: true, reason: "dedupe", dedupeKey: body.dedupeKey })
    }

    const accountResult = await client.database
      .from("client_portal_accounts")
      .select("id,status")
      .eq("gym_id", gymId)
      .eq("client_id", clientId)
      .eq("status", "claimed")
      .maybeSingle()

    if (accountResult.error || !accountResult.data) {
      await client.database.from("notification_log").insert([
        {
          gym_id: gymId,
          client_id: clientId,
          pass_id: body.passId ?? null,
          channel: "push",
          event_type: eventType,
          status: "skipped",
          subject: String(body.title),
          body: String(body.body),
          payload: { url: body.url ?? "/cliente/dashboard", reason: "no_claimed_portal_account" },
          dedupe_key: String(body.dedupeKey),
          processed_at: new Date().toISOString(),
          error_message: "no_claimed_portal_account"
        }
      ])
      return json({ ok: true, skipped: true, reason: "no_claimed_portal_account" })
    }

    const preferenceResult = await client.database
      .from("push_preferences")
      .select("*")
      .eq("gym_id", gymId)
      .eq("client_portal_account_id", accountResult.data.id)
      .maybeSingle()

    if (preferenceKey && preferenceResult.data && preferenceResult.data[preferenceKey] === false) {
      await client.database.from("notification_log").insert([
        {
          gym_id: gymId,
          client_id: clientId,
          pass_id: body.passId ?? null,
          channel: "push",
          event_type: eventType,
          status: "skipped",
          subject: String(body.title),
          body: String(body.body),
          payload: { url: body.url ?? "/cliente/dashboard", reason: "preference_disabled" },
          dedupe_key: String(body.dedupeKey),
          processed_at: new Date().toISOString(),
          error_message: "preference_disabled"
        }
      ])
      return json({ ok: true, skipped: true, reason: "preference_disabled" })
    }

    const subscriptionsResult = await client.database
      .from("push_subscriptions")
      .select("*")
      .eq("gym_id", gymId)
      .eq("client_portal_account_id", accountResult.data.id)
      .eq("is_active", true)

    if (subscriptionsResult.error) {
      return json({ code: "SUBSCRIPTIONS_LOAD_FAILED", message: subscriptionsResult.error.message }, 400)
    }

    const sendResult = await client.functions.invoke("send_push_notification", {
      body: {
        gymId,
        gymSlug,
        subscriptions: subscriptionsResult.data ?? [],
        title: body.title,
        body: body.body,
        url: body.url ?? "/cliente/dashboard",
        eventType,
        dedupeKey: body.dedupeKey,
        clientId,
        passId: body.passId ?? null
      }
    })

    if (sendResult.error) {
      return json({ code: "PUSH_SEND_FAILED", message: sendResult.error.message }, 400)
    }

    return json(sendResult.data ?? { ok: true })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
