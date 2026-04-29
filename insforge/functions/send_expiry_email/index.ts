// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"
const BUSINESS_NAME = "Trainium"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function mapReminderType(reminderType: string) {
  if (reminderType === "expiry_reminder_d7" || reminderType === "pass_expiry_d7") {
    return { eventType: "expiry_reminder_d7", daysLabel: "7 días" }
  }

  if (reminderType === "expiry_reminder_d0" || reminderType === "pass_expiry_d0") {
    return { eventType: "expiry_reminder_d0", daysLabel: "hoy" }
  }

  return null
}

function buildEmailHtml(fullName: string, expiresOn: string, daysLabel: string) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h1 style="font-size: 20px;">Recordatorio de bono</h1>
      <p>Hola ${fullName},</p>
      <p>Tu bono en ${BUSINESS_NAME} caduca ${daysLabel === "hoy" ? "hoy" : `en ${daysLabel}` }.</p>
      <p>Fecha de caducidad: <strong>${expiresOn}</strong></p>
      <p>Si quieres renovarlo, responde a este correo o contacta con el gimnasio.</p>
    </div>
  `
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

async function insertNotificationLog(client: any, payload: Record<string, unknown>) {
  const insertResult = await client.database.from("notification_log").insert([payload]).select("id").single()
  if (insertResult.error || !insertResult.data) {
    throw new Error(insertResult.error?.message ?? "No se pudo registrar notification_log")
  }

  return String(insertResult.data.id)
}

async function insertAuditLog(client: any, actorProfileId: string, entityId: string, diff: Record<string, unknown>) {
  await client.database.from("audit_logs").insert([
    {
      actor_profile_id: actorProfileId,
      entity_name: "notification_log",
      entity_id: entityId,
      action: "send_notification",
      diff
    }
  ])
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    const mappedReminder = mapReminderType(String(body?.reminderType ?? ""))
    if (!body?.passId || !mappedReminder) {
      return json({ code: "INVALID_INPUT", message: "Pass y reminderType son obligatorios" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const existingResult = await client.database
      .from("notification_log")
      .select("id,status")
      .eq("pass_id", body.passId)
      .eq("channel", "email")
      .eq("event_type", mappedReminder.eventType)
      .limit(1)
      .maybeSingle()

    if (!existingResult.error && existingResult.data?.id) {
      await insertAuditLog(client, actor.profile.id, String(existingResult.data.id), {
        channel: "email",
        event_type: mappedReminder.eventType,
        skipped: true,
        reason: "already_logged"
      })

      return json({
        ok: true,
        skipped: true,
        reason: "already_logged",
        notificationId: existingResult.data.id
      })
    }

    const [passResult, holderResult] = await Promise.all([
      client.database.from("passes").select("*").eq("id", body.passId).maybeSingle(),
      client.database
        .from("pass_holders")
        .select("client_id")
        .eq("pass_id", body.passId)
        .eq("holder_order", 1)
        .maybeSingle()
    ])

    if (passResult.error || !passResult.data) {
      return json({ code: "NOT_FOUND", message: "Bono no encontrado" }, 404)
    }

    const primaryHolderId = holderResult.data?.client_id
    if (!primaryHolderId) {
      return json({ code: "NOT_FOUND", message: "Titular principal no encontrado" }, 404)
    }

    const clientResult = await client.database
      .from("clients")
      .select("*")
      .eq("id", primaryHolderId)
      .maybeSingle()

    if (clientResult.error || !clientResult.data) {
      return json({ code: "NOT_FOUND", message: "Cliente no encontrado" }, 404)
    }

    const fullName = `${clientResult.data.first_name ?? ""} ${clientResult.data.last_name ?? ""}`.trim()
    const recipient = clientResult.data.email ? String(clientResult.data.email) : null
    const subject =
      mappedReminder.eventType === "expiry_reminder_d0"
        ? `${BUSINESS_NAME}: tu bono caduca hoy`
        : `${BUSINESS_NAME}: tu bono caduca en 7 días`

    if (!recipient) {
      const notificationId = await insertNotificationLog(client, {
        client_id: clientResult.data.id,
        pass_id: passResult.data.id,
        channel: "email",
        event_type: mappedReminder.eventType,
        status: "skipped",
        recipient: null,
        subject,
        body: "No se pudo enviar porque el cliente no tiene email.",
        payload: { provider: "logger", reason: "missing_email" },
        error_message: "Cliente sin email"
      })

      await insertAuditLog(client, actor.profile.id, notificationId, {
        channel: "email",
        event_type: mappedReminder.eventType,
        skipped: true,
        reason: "missing_email"
      })

      return json({ ok: true, skipped: true, reason: "missing_email", notificationId })
    }

    const html = buildEmailHtml(fullName || "cliente", String(passResult.data.expires_on), mappedReminder.daysLabel)
    const sendResult = await client.emails.send({
      to: recipient,
      subject,
      html
    })

    if (sendResult.error) {
      const notificationId = await insertNotificationLog(client, {
        client_id: clientResult.data.id,
        pass_id: passResult.data.id,
        channel: "email",
        event_type: mappedReminder.eventType,
        status: "skipped",
        recipient,
        subject,
        body: html,
        payload: { provider: "logger", fallback: true },
        error_message: sendResult.error.message
      })

      await insertAuditLog(client, actor.profile.id, notificationId, {
        channel: "email",
        event_type: mappedReminder.eventType,
        recipient,
        skipped: true,
        provider: "logger"
      })

      return json({
        ok: true,
        skipped: true,
        provider: "logger",
        reason: "email_unavailable",
        notificationId
      })
    }

    const notificationId = await insertNotificationLog(client, {
      client_id: clientResult.data.id,
      pass_id: passResult.data.id,
      channel: "email",
      event_type: mappedReminder.eventType,
      status: "sent",
      recipient,
      subject,
      body: html,
      payload: { provider: "insforge-email" },
      processed_at: new Date().toISOString()
    })

    await insertAuditLog(client, actor.profile.id, notificationId, {
      channel: "email",
      event_type: mappedReminder.eventType,
      recipient
    })

    return json({
      ok: true,
      notificationId,
      provider: "insforge-email"
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
