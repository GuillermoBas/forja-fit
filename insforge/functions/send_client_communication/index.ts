// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"
const BUSINESS_NAME = "Trainium"
const DEFAULT_CHANNELS = ["email", "push"]
const ALLOWED_CHANNELS = new Set(["email", "push"])
const ALLOWED_EVENT_TYPES = new Set([
  "pass_expiry_d7",
  "pass_expiry_d0",
  "pass_assigned",
  "renewal_confirmation",
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

function normalizeEventType(value: string) {
  if (value === "expiry_reminder_d7") return "pass_expiry_d7"
  if (value === "expiry_reminder_d0") return "pass_expiry_d0"
  return value
}

function formatDateEs(dateString?: string) {
  if (!dateString) return ""
  const [year, month, day] = String(dateString).slice(0, 10).split("-")
  if (year && month && day) return `${day}/${month}/${year}`
  return String(dateString)
}

function formatTimeEs(isoString?: string) {
  if (!isoString) return ""
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(String(isoString)))
}

function formatSessionReminderDateEs(isoString?: string) {
  if (!isoString) return ""

  const date = new Date(String(isoString))
  const weekday = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long"
  }).format(date)
  const dayMonth = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "short"
  }).format(date).replace(".", "")

  return `${weekday}, ${dayMonth}`
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim()).map(String)))
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function buildTemplate(eventType: string, data: Record<string, unknown>) {
  const passTypeName = String(data.passTypeName ?? "bono")
  const expiresOn = formatDateEs(String(data.expiresOn ?? ""))
  const sessionsLeft = data.sessionsLeft === null || data.sessionsLeft === undefined
    ? null
    : Number(data.sessionsLeft)
  const trainerName = String(data.trainerName ?? "").trim()
  const sessionReminderDate = formatSessionReminderDateEs(String(data.startsAt ?? ""))
  const sessionTime = formatTimeEs(String(data.startsAt ?? ""))

  if (eventType === "pass_expiry_d0") {
    return {
      subject: `${BUSINESS_NAME}: tu bono caduca hoy`,
      title: "Tu bono caduca hoy",
      text: `Tu ${passTypeName} caduca hoy${sessionsLeft !== null ? ` y te quedan ${sessionsLeft} sesiones` : ""}.`,
      url: "/cliente/dashboard"
    }
  }

  if (eventType === "pass_expiry_d7") {
    return {
      subject: `${BUSINESS_NAME}: tu bono caduca en 7 dias`,
      title: "Tu bono caduca en 7 dias",
      text: `Tu ${passTypeName} caduca el ${expiresOn}${sessionsLeft !== null ? ` y te quedan ${sessionsLeft} sesiones` : ""}.`,
      url: "/cliente/dashboard"
    }
  }

  if (eventType === "pass_assigned") {
    return {
      subject: `${BUSINESS_NAME}: nuevo bono activo`,
      title: "Nuevo bono asignado",
      text: `Tu ${passTypeName} ya esta activo${expiresOn ? `. Caduca el ${expiresOn}` : ""}.`,
      url: "/cliente/dashboard"
    }
  }

  if (eventType === "renewal_confirmation") {
    return {
      subject: `${BUSINESS_NAME}: renovacion registrada`,
      title: "Renovacion registrada",
      text: `Hemos registrado la renovacion de tu ${passTypeName}${expiresOn ? `. Caduca el ${expiresOn}` : ""}.`,
      url: "/cliente/dashboard"
    }
  }

  if (eventType === "calendar_session_24h") {
    const reminderTitle = `Recordatorio de sesión con ${trainerName || "tu entrenador"}`
    return {
      subject: reminderTitle,
      title: reminderTitle,
      text: `Tu sesión esta agendada para el ${sessionReminderDate || "día previsto"}.${sessionTime ? ` A las ${sessionTime}.` : ""}`,
      url: "/cliente/agenda"
    }
  }

  return {
    subject: String(data.subject ?? "Aviso de Trainium").trim() || "Aviso de Trainium",
    title: String(data.title ?? data.subject ?? "Aviso de Trainium").trim() || "Aviso de Trainium",
    text: String(data.body ?? data.message ?? "Tienes una novedad en tu portal.").trim(),
    url: String(data.url ?? "/cliente/dashboard")
  }
}

function buildEmailHtml(fullName: string, subject: string, text: string) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h1 style="font-size: 20px;">${escapeHtml(subject)}</h1>
      <p>Hola ${escapeHtml(fullName || "cliente")},</p>
      <p>${escapeHtml(text)}</p>
      <p>Si tienes cualquier duda, contacta con el gimnasio.</p>
    </div>
  `
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

async function insertNotificationLog(client: any, payload: Record<string, unknown>) {
  const existing = await client.database
    .from("notification_log")
    .select("id,status")
    .eq("dedupe_key", payload.dedupe_key)
    .maybeSingle()

  if (!existing.error && existing.data?.id) {
    return { id: String(existing.data.id), duplicate: true }
  }

  const insertResult = await client.database.from("notification_log").insert([payload]).select("id").single()
  if (insertResult.error || !insertResult.data) {
    throw new Error(insertResult.error?.message ?? "No se pudo registrar notification_log")
  }

  return { id: String(insertResult.data.id), duplicate: false }
}

async function insertAuditLog(client: any, actorProfileId: string | null, diff: Record<string, unknown>) {
  await client.database.from("audit_logs").insert([
    {
      actor_profile_id: actorProfileId,
      entity_name: "notification_log",
      entity_id: null,
      action: "send_notification",
      diff
    }
  ])
}

async function sendEmail({
  client,
  actorProfileId,
  clientRow,
  passId,
  saleId,
  eventType,
  dedupeKey,
  template,
  templateData
}: {
  client: any
  actorProfileId: string | null
  clientRow: Record<string, unknown>
  passId: string | null
  saleId: string | null
  eventType: string
  dedupeKey: string
  template: Record<string, string>
  templateData: Record<string, unknown>
}) {
  const existing = await client.database
    .from("notification_log")
    .select("id,status")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle()

  if (!existing.error && existing.data?.id) {
    return { channel: "email", status: "skipped", reason: "dedupe" }
  }

  const fullName = `${clientRow.first_name ?? ""} ${clientRow.last_name ?? ""}`.trim()
  const recipient = clientRow.email ? String(clientRow.email).trim() : ""
  const html = buildEmailHtml(fullName, template.subject, template.text)
  const commonLog = {
    client_id: clientRow.id,
    pass_id: passId,
    sale_id: saleId,
    channel: "email",
    event_type: eventType,
    recipient: recipient || null,
    subject: template.subject,
    body: html,
    payload: { templateData, templateText: template.text, templateTitle: template.title },
    dedupe_key: dedupeKey,
    processed_at: new Date().toISOString()
  }

  if (!recipient) {
    await insertNotificationLog(client, {
      ...commonLog,
      status: "skipped",
      error_message: "missing_email"
    })
    await insertAuditLog(client, actorProfileId, {
      channel: "email",
      event_type: eventType,
      recipient: null,
      status: "skipped",
      reason: "missing_email"
    })
    return { channel: "email", status: "skipped", reason: "missing_email" }
  }

  if (!client.emails?.send) {
    await insertNotificationLog(client, {
      ...commonLog,
      status: "failed",
      error_message: "email_service_unavailable"
    })
    await insertAuditLog(client, actorProfileId, {
      channel: "email",
      event_type: eventType,
      recipient,
      status: "failed",
      reason: "email_service_unavailable"
    })
    return { channel: "email", status: "failed", reason: "email_service_unavailable" }
  }

  const sendResult = await client.emails.send({
    to: recipient,
    subject: template.subject,
    html
  })

  if (sendResult.error) {
    await insertNotificationLog(client, {
      ...commonLog,
      status: "failed",
      error_message: sendResult.error.message
    })
    await insertAuditLog(client, actorProfileId, {
      channel: "email",
      event_type: eventType,
      recipient,
      status: "failed"
    })
    return { channel: "email", status: "failed", reason: sendResult.error.message }
  }

  await insertNotificationLog(client, {
    ...commonLog,
    status: "sent",
    payload: { templateData, templateText: template.text, templateTitle: template.title, provider: "insforge-email" }
  })
  await insertAuditLog(client, actorProfileId, {
    channel: "email",
    event_type: eventType,
    recipient,
    status: "sent"
  })
  return { channel: "email", status: "sent" }
}

async function sendPush({
  client,
  clientId,
  passId,
  eventType,
  dedupeKey,
  template
}: {
  client: any
  clientId: string
  passId: string | null
  eventType: string
  dedupeKey: string
  template: Record<string, string>
}) {
  const result = await client.functions.invoke("send_push_to_client", {
    body: {
      clientId,
      passId,
      eventType,
      dedupeKey,
      title: template.title,
      body: template.text,
      url: template.url || "/cliente/dashboard"
    }
  })

  if (result.error) {
    return { channel: "push", status: "failed", reason: result.error.message }
  }

  if (result.data?.skipped) {
    return { channel: "push", status: "skipped", reason: result.data.reason ?? "skipped" }
  }

  return { channel: "push", status: "sent", sent: result.data?.sent ?? 0 }
}

export default async function(request: Request) {
  try {
    const token = getToken(request)
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const eventType = normalizeEventType(String(body?.eventType ?? ""))
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return json({ code: "INVALID_INPUT", message: "Tipo de comunicacion no valido" }, 400)
    }

    const clientIds = uniqueStrings([
      ...(Array.isArray(body?.clientIds) ? body.clientIds : []),
      body?.clientId
    ])
    if (!clientIds.length) {
      return json({ code: "INVALID_INPUT", message: "Al menos un cliente es obligatorio" }, 400)
    }

    const channels = uniqueStrings(Array.isArray(body?.channels) ? body.channels : DEFAULT_CHANNELS)
      .filter((channel) => ALLOWED_CHANNELS.has(channel))
    if (!channels.length) {
      return json({ code: "INVALID_INPUT", message: "No hay canales validos para enviar" }, 400)
    }

    const trusted = isTrustedToken(token)
    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const actor = trusted ? { profile: { id: null, role: "admin" } } : await requireStaffActor(client)
    if ("error" in actor) {
      return actor.error
    }

    const clientsResult = await client.database.from("clients").select("*").in("id", clientIds)
    if (clientsResult.error || !clientsResult.data) {
      return json({ code: "CLIENTS_LOAD_FAILED", message: clientsResult.error?.message ?? "No se pudieron cargar clientes" }, 400)
    }

    const foundClients = new Map((clientsResult.data ?? []).map((row) => [String(row.id), row]))
    const passId = typeof body?.passId === "string" ? body.passId : null
    const saleId = typeof body?.saleId === "string" ? body.saleId : null
    const templateData = {
      ...(body?.templateData && typeof body.templateData === "object" ? body.templateData : {}),
      subject: body?.subject,
      title: body?.title,
      body: body?.body,
      message: body?.message,
      url: body?.url
    }
    const template = buildTemplate(eventType, templateData)
    const dedupeSeed = String(body?.dedupeSeed ?? passId ?? saleId ?? templateData.calendarSessionId ?? Date.now())
    const results: Array<Record<string, unknown>> = []

    for (const clientId of clientIds) {
      const clientRow = foundClients.get(clientId)
      if (!clientRow) {
        results.push({ clientId, status: "skipped", reason: "client_not_found" })
        continue
      }

      for (const channel of channels) {
        const dedupeKey = `${eventType}:${channel}:${clientId}:${dedupeSeed}`
        if (channel === "email") {
          results.push({
            clientId,
            ...(await sendEmail({
              client,
              actorProfileId: actor.profile.id,
              clientRow,
              passId,
              saleId,
              eventType,
              dedupeKey,
              template,
              templateData
            }))
          })
        }

        if (channel === "push") {
          const pushResult = await sendPush({
            client,
            clientId,
            passId,
            eventType,
            dedupeKey,
            template
          })
          await insertAuditLog(client, actor.profile.id, {
            channel: "push",
            event_type: eventType,
            client_id: clientId,
            status: pushResult.status,
            reason: pushResult.reason ?? null
          })
          results.push({ clientId, ...pushResult })
        }
      }
    }

    return json({
      ok: true,
      eventType,
      channels,
      results,
      sent: results.filter((result) => result.status === "sent").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
