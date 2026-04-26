// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"
import * as webpush from "jsr:@negrel/webpush"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"
const ALLOWED_EVENT_TYPES = new Set([
  "pass_expiry_d7",
  "pass_assigned",
  "calendar_session_24h",
  "manual_note"
])

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

function base64UrlToUint8Array(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function buildVapidJwk(publicKey: string, privateKey: string) {
  const publicBytes = base64UrlToUint8Array(publicKey)
  const privateBytes = base64UrlToUint8Array(privateKey)

  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("VAPID keys no validas. Usa claves P-256 en formato base64url.")
  }

  return {
    publicKey: {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(publicBytes.slice(1, 33)),
      y: base64UrlEncode(publicBytes.slice(33, 65)),
      ext: true
    },
    privateKey: {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(publicBytes.slice(1, 33)),
      y: base64UrlEncode(publicBytes.slice(33, 65)),
      d: base64UrlEncode(privateBytes),
      ext: false
    }
  }
}

async function getApplicationServer() {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:soporte@forjafit.com"

  if (!publicKey || !privateKey) {
    throw new Error("Faltan VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY")
  }

  const vapidKeys = await webpush.importVapidKeys(buildVapidJwk(publicKey, privateKey), {
    extractable: false
  })

  return webpush.ApplicationServer.new({
    contactInformation: subject,
    vapidKeys
  })
}

async function sendEncryptedPush({
  endpoint,
  p256dh,
  auth,
  payload
}: {
  endpoint: string
  p256dh: string
  auth: string
  payload: Record<string, unknown>
}) {
  const appServer = await getApplicationServer()
  const subscriber = appServer.subscribe({
    endpoint,
    keys: { p256dh, auth }
  })

  try {
    await subscriber.pushTextMessage(JSON.stringify(payload), {
      ttl: 60 * 60 * 24,
      urgency: webpush.Urgency.Normal
    })
    return { ok: true, status: 201 }
  } catch (error) {
    const response = error?.response
    return {
      ok: false,
      status: response?.status ?? 0,
      message: error instanceof Error ? error.message : "No se pudo enviar la notificacion push"
    }
  }
}

async function requireStaffActor(client: any) {
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
    const token = getToken(request)
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const subscriptions = Array.isArray(body?.subscriptions) ? body.subscriptions : []
    const title = typeof body?.title === "string" ? body.title.trim() : ""
    const notificationBody = typeof body?.body === "string" ? body.body.trim() : ""
    const url = typeof body?.url === "string" ? body.url.trim() : "/cliente/dashboard"
    const eventType = typeof body?.eventType === "string" ? body.eventType : ""
    const dedupeKey = typeof body?.dedupeKey === "string" ? body.dedupeKey.trim() : ""
    const clientId = typeof body?.clientId === "string" ? body.clientId : null
    const passId = typeof body?.passId === "string" ? body.passId : null

    if (!title || !notificationBody || !ALLOWED_EVENT_TYPES.has(eventType) || !dedupeKey) {
      return json({ code: "INVALID_INPUT", message: "Notificacion push incompleta" }, 400)
    }

    const trusted = isTrustedToken(token)
    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const actor = trusted ? { profile: { id: null, role: "admin" } } : await requireStaffActor(client)
    if ("error" in actor) {
      return actor.error
    }

    const existingLog = await client.database
      .from("notification_log")
      .select("id,status")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle()

    if (!existingLog.error && existingLog.data?.id) {
      return json({ ok: true, skipped: true, reason: "dedupe", dedupeKey })
    }

    if (!subscriptions.length) {
      await client.database.from("notification_log").insert([
        {
          client_id: clientId,
          pass_id: passId,
          channel: "push",
          event_type: eventType,
          status: "skipped",
          recipient: null,
          subject: title,
          body: notificationBody,
          payload: { url, reason: "no_active_subscription" },
          dedupe_key: dedupeKey,
          processed_at: new Date().toISOString(),
          error_message: "no_active_subscription"
        }
      ])
      return json({ ok: true, skipped: true, reason: "no_active_subscription", dedupeKey })
    }

    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const subscription of subscriptions) {
      const result = await sendEncryptedPush({
        endpoint: String(subscription.endpoint ?? ""),
        p256dh: String(subscription.p256dh ?? ""),
        auth: String(subscription.auth ?? ""),
        payload: {
          title,
          body: notificationBody,
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-96.png",
          url,
          eventType
        }
      })

      if (result.ok) {
        sent += 1
      } else {
        failed += 1
        errors.push(`${subscription.endpoint}: ${result.status} ${result.message}`)

        if (result.status === 404 || result.status === 410) {
          await client.database
            .from("push_subscriptions")
            .update({ is_active: false, revoked_at: new Date().toISOString() })
            .eq("id", subscription.id)
        }
      }
    }

    const status = sent > 0 ? "sent" : "failed"
    await client.database.from("notification_log").insert([
      {
        client_id: clientId,
        pass_id: passId,
        channel: "push",
        event_type: eventType,
        status,
        recipient: subscriptions.map((subscription) => subscription.endpoint).join(","),
        subject: title,
        body: notificationBody,
        payload: { url, sent, failed },
        dedupe_key: dedupeKey,
        processed_at: new Date().toISOString(),
        error_message: errors.length ? errors.join("\n").slice(0, 2000) : null
      }
    ])

    await client.database.from("audit_logs").insert([
      {
        actor_profile_id: actor.profile.id,
        entity_name: "notification_log",
        entity_id: null,
        action: "send_notification",
        diff: { channel: "push", event_type: eventType, dedupe_key: dedupeKey, sent, failed }
      }
    ])

    return json({ ok: true, sent, failed, dedupeKey })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
