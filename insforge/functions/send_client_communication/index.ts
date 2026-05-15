// @ts-nocheck
const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"
const FUNCTIONS_URL = "https://4nc39nmu.functions.insforge.app"
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
  return token.startsWith("ik_")
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
    .replace(/\u003c/g, "&lt;")
    .replace(/\u003e/g, "&gt;")
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
      subject: `${BUSINESS_NAME}: tu bono caduca en 7 días`,
      title: "Tu bono caduca en 7 días",
      text: `Tu ${passTypeName} caduca el ${expiresOn}${sessionsLeft !== null ? ` y te quedan ${sessionsLeft} sesiones` : ""}.`,
      url: "/cliente/dashboard"
    }
  }

  if (eventType === "pass_assigned") {
    return {
      subject: `${BUSINESS_NAME}: nuevo bono activo`,
      title: "Nuevo bono asignado",
      text: `Tu ${passTypeName} ya está activo${expiresOn ? `. Caduca el ${expiresOn}` : ""}.`,
      url: "/cliente/dashboard"
    }
  }

  if (eventType === "renewal_confirmation") {
    return {
      subject: `${BUSINESS_NAME}: renovación registrada`,
      title: "Renovación registrada",
      text: `Hemos registrado la renovación de tu ${passTypeName}${expiresOn ? `. Caduca el ${expiresOn}` : ""}.`,
      url: "/cliente/dashboard"
    }
  }

  if (eventType === "calendar_session_24h") {
    const reminderTitle = `Recordatorio de sesión con ${trainerName || "tu entrenador"}`
    return {
      subject: reminderTitle,
      title: reminderTitle,
      text: `Tu sesión está agendada para el ${sessionReminderDate || "día previsto"}.${sessionTime ? ` A las ${sessionTime}.` : ""}`,
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
  return [
    escapeHtml(subject),
    "",
    `Hola ${escapeHtml(fullName || "cliente")},`,
    "",
    escapeHtml(text),
    "",
    "Si tienes cualquier duda, contacta con el gimnasio."
  ].join("\n")
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    return { data: null, error: data?.message || data?.error || response.statusText }
  }

  return { data, error: null }
}

async function selectRecords(table: string, token: string, params: Record<string, string>) {
  const query = new URLSearchParams(params)
  return apiFetch(`/api/database/records/${table}?${query}`, token)
}

async function insertRecord(table: string, token: string, payload: Record<string, unknown>) {
  return apiFetch(`/api/database/records/${table}`, token, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([payload])
  })
}

async function sendRawEmail(token: string, payload: Record<string, unknown>) {
  return apiFetch("/api/email/send-raw", token, {
    method: "POST",
    body: JSON.stringify(payload)
  })
}

async function invokeFunction(slug: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(`${FUNCTIONS_URL}/${slug}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  })
  const data = await response.json().catch(() => null)

  if (!response.ok || data?.code) {
    return { data: null, error: data?.message || data?.error || response.statusText }
  }

  return { data, error: null }
}

async function requireStaffActor(token: string, gymId: string) {
  const authResult = await apiFetch("/api/auth/sessions/current", token)
  if (authResult.error || !authResult.data?.user) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesión no válida" }, 401) }
  }

  const profileResult = await selectRecords("profiles", token, {
    select: "*",
    auth_user_id: `eq.${authResult.data.user.id}`,
    gym_id: `eq.${gymId}`,
    limit: "1"
  })
  const profile = Array.isArray(profileResult.data) ? profileResult.data[0] : null

  if (profileResult.error || !profile) {
    return { error: json({ code: "PROFILE_REQUIRED", message: "Perfil no encontrado" }, 403) }
  }

  return { profile }
}

async function insertNotificationLog(token: string, payload: Record<string, unknown>) {
  const existing = await selectRecords("notification_log", token, {
    select: "id,status",
    gym_id: `eq.${payload.gym_id}`,
    dedupe_key: `eq.${payload.dedupe_key}`,
    limit: "1"
  })
  const existingRow = Array.isArray(existing.data) ? existing.data[0] : null

  if (!existing.error && existingRow?.id) {
    return { id: String(existingRow.id), duplicate: true }
  }

  const insertResult = await insertRecord("notification_log", token, payload)
  const inserted = Array.isArray(insertResult.data) ? insertResult.data[0] : insertResult.data
  if (insertResult.error || !inserted) {
    throw new Error(insertResult.error ?? "No se pudo registrar notification_log")
  }

  return { id: String(inserted.id), duplicate: false }
}

async function insertAuditLog(token: string, gymId: string, actorProfileId: string | null, diff: Record<string, unknown>) {
  await insertRecord("audit_logs", token, {
    gym_id: gymId,
    actor_profile_id: actorProfileId,
    entity_name: "notification_log",
    entity_id: null,
    action: "send_notification",
    diff
  })
}

async function sendEmail({
  token,
  gymId,
  actorProfileId,
  clientRow,
  passId,
  saleId,
  eventType,
  dedupeKey,
  template,
  templateData
}: {
  token: string
  gymId: string
  actorProfileId: string | null
  clientRow: Record<string, unknown>
  passId: string | null
  saleId: string | null
  eventType: string
  dedupeKey: string
  template: Record<string, string>
  templateData: Record<string, unknown>
}) {
  const existing = await selectRecords("notification_log", token, {
    select: "id,status",
    gym_id: `eq.${gymId}`,
    dedupe_key: `eq.${dedupeKey}`,
    limit: "1"
  })
  const existingRow = Array.isArray(existing.data) ? existing.data[0] : null

  if (!existing.error && existingRow?.id) {
    return { channel: "email", status: "skipped", reason: "dedupe" }
  }

  const fullName = `${clientRow.first_name ?? ""} ${clientRow.last_name ?? ""}`.trim()
  const recipient = clientRow.email ? String(clientRow.email).trim() : ""
  const html = buildEmailHtml(fullName, template.subject, template.text)
  const commonLog = {
    gym_id: gymId,
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
    await insertNotificationLog(token, {
      ...commonLog,
      status: "skipped",
      error_message: "missing_email"
    })
    await insertAuditLog(token, gymId, actorProfileId, {
      channel: "email",
      event_type: eventType,
      recipient: null,
      status: "skipped",
      reason: "missing_email"
    })
    return { channel: "email", status: "skipped", reason: "missing_email" }
  }

  const sendResult = await sendRawEmail(token, {
    to: recipient,
    subject: template.subject,
    html
  })

  if (sendResult.error) {
    await insertNotificationLog(token, {
      ...commonLog,
      status: "failed",
      error_message: sendResult.error
    })
    await insertAuditLog(token, gymId, actorProfileId, {
      channel: "email",
      event_type: eventType,
      recipient,
      status: "failed"
    })
    return { channel: "email", status: "failed", reason: sendResult.error }
  }

  await insertNotificationLog(token, {
    ...commonLog,
    status: "sent",
    payload: { templateData, templateText: template.text, templateTitle: template.title, provider: "insforge-email" }
  })
  await insertAuditLog(token, gymId, actorProfileId, {
    channel: "email",
    event_type: eventType,
    recipient,
    status: "sent"
  })
  return { channel: "email", status: "sent" }
}

async function sendPush({
  token,
  gymId,
  gymSlug,
  clientId,
  passId,
  eventType,
  dedupeKey,
  template
}: {
  token: string
  gymId: string
  gymSlug: string
  clientId: string
  passId: string | null
  eventType: string
  dedupeKey: string
  template: Record<string, string>
}) {
  const result = await invokeFunction("send_push_to_client", token, {
    gymId,
    gymSlug,
    clientId,
    passId,
    eventType,
    dedupeKey,
    title: template.title,
    body: template.text,
    url: template.url || "/cliente/dashboard"
  })

  if (result.error) {
    return { channel: "push", status: "failed", reason: result.error }
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
    const gymId = String(body?.gymId ?? "")
    const gymSlug = String(body?.gymSlug ?? "eltemplo")
    const eventType = normalizeEventType(String(body?.eventType ?? ""))
    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return json({ code: "INVALID_INPUT", message: "Tipo de comunicación no válido" }, 400)
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
      return json({ code: "INVALID_INPUT", message: "No hay canales válidos para enviar" }, 400)
    }

    const trusted = isTrustedToken(token)
    const actor = trusted ? { profile: { id: null, role: "admin" } } : await requireStaffActor(token, gymId)
    if ("error" in actor) {
      return actor.error
    }

    const clientsResult = await selectRecords("clients", token, {
      select: "*",
      gym_id: `eq.${gymId}`,
      id: `in.(${clientIds.join(",")})`
    })
    if (clientsResult.error || !clientsResult.data) {
      return json({ code: "CLIENTS_LOAD_FAILED", message: clientsResult.error ?? "No se pudieron cargar clientes" }, 400)
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
              token,
              gymId,
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
            token,
            gymId,
            gymSlug,
            clientId,
            passId,
            eventType,
            dedupeKey,
            template
          })
          await insertAuditLog(token, gymId, actor.profile.id, {
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
