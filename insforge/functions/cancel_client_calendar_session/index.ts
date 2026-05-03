// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function getSafeMessage(message: string) {
  if (message.includes("NO_SESSION")) {
    return "No se encontro la sesion indicada."
  }

  if (message.includes("FORBIDDEN")) {
    return "No puedes cancelar esta sesion."
  }

  if (message.includes("INVALID_STATUS")) {
    return "Solo se pueden cancelar sesiones programadas."
  }

  if (message.includes("CANCELLATION_WINDOW")) {
    return "Solo puedes cancelar una sesion hasta 24 horas antes."
  }

  return message || "No se pudo cancelar la sesion."
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const calendarSessionId = typeof body?.calendarSessionId === "string"
      ? body.calendarSessionId.trim()
      : ""

    if (!calendarSessionId) {
      return json({ code: "INVALID_INPUT", message: "La sesion es obligatoria." }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const authResult = await client.auth.getCurrentUser()
    if (authResult.error || !authResult.data?.user?.id) {
      return json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401)
    }

    const portalAccountResult = await client.database
      .from("client_portal_accounts")
      .select("*")
      .eq("auth_user_id", authResult.data.user.id)
      .maybeSingle()

    if (portalAccountResult.error || !portalAccountResult.data) {
      return json(
        {
          code: "PORTAL_ACCOUNT_REQUIRED",
          message: "No hay acceso al portal asociado a este usuario."
        },
        403
      )
    }

    if (portalAccountResult.data.status !== "claimed") {
      return json(
        {
          code: "PORTAL_DISABLED",
          message: "El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio."
        },
        403
      )
    }

    const sessionResult = await client.database
      .from("calendar_sessions")
      .select("id,client_1_id,client_2_id,trainer_profile_id,starts_at,ends_at,status")
      .eq("id", calendarSessionId)
      .maybeSingle()

    if (sessionResult.error || !sessionResult.data) {
      return json({ code: "NOT_FOUND", message: "NO_SESSION" }, 404)
    }

    const session = sessionResult.data
    const clientId = String(portalAccountResult.data.client_id)
    const ownerIds = [session.client_1_id, session.client_2_id].filter(Boolean).map(String)

    if (!ownerIds.includes(clientId)) {
      return json({ code: "FORBIDDEN", message: "FORBIDDEN" }, 403)
    }

    if (String(session.status) !== "scheduled") {
      return json({ code: "INVALID_STATUS", message: "INVALID_STATUS" }, 400)
    }

    const startsAt = new Date(String(session.starts_at))
    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000)
    if (startsAt.getTime() <= cutoff.getTime()) {
      return json({ code: "CANCELLATION_WINDOW", message: "CANCELLATION_WINDOW" }, 400)
    }

    const updateResult = await client.database
      .from("calendar_sessions")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString()
      })
      .eq("id", calendarSessionId)
      .select("id,status,starts_at,ends_at")
      .maybeSingle()

    if (updateResult.error || !updateResult.data) {
      return json(
        {
          code: "SESSION_UPDATE_FAILED",
          message: updateResult.error?.message ?? "No se pudo cancelar la sesion."
        },
        400
      )
    }

    const auditResult = await client.database.from("audit_logs").insert([
      {
        actor_profile_id: null,
        entity_name: "calendar_sessions",
        entity_id: calendarSessionId,
        action: "update",
        diff: {
          source: "client_portal",
          action: "client_cancel_session",
          client_id: clientId,
          portal_account_id: portalAccountResult.data.id,
          previous_status: session.status,
          next_status: "cancelled"
        }
      }
    ])

    if (auditResult.error) {
      return json(
        {
          code: "AUDIT_LOG_FAILED",
          message: auditResult.error.message ?? "No se pudo registrar la auditoria."
        },
        400
      )
    }

    const notificationResult = await client.database.from("notification_log").insert([
      {
        client_id: clientId,
        pass_id: null,
        sale_id: null,
        channel: "internal",
        event_type: "manual_note",
        status: "sent",
        recipient: "staff",
        subject: "Cancelacion de sesion desde portal",
        body: "Un cliente ha cancelado una sesion desde el portal.",
        payload: {
          source: "client_portal",
          calendar_session_id: calendarSessionId,
          trainer_profile_id: session.trainer_profile_id ?? null
        },
        processed_at: new Date().toISOString()
      }
    ])

    if (notificationResult.error) {
      return json(
        {
          code: "NOTIFICATION_LOG_FAILED",
          message: notificationResult.error.message ?? "No se pudo registrar la notificacion interna."
        },
        400
      )
    }

    try {
      const apiKey = Deno.env.get("API_KEY")
      if (apiKey) {
        const trustedClient = createClient({
          baseUrl: BASE_URL,
          edgeFunctionToken: apiKey
        })
        await trustedClient.functions.invoke("send_client_communication", {
          body: {
            clientIds: [clientId],
            eventType: "manual_note",
            channels: ["email", "push"],
            dedupeSeed: `client_cancel_session:${calendarSessionId}`,
            subject: "Sesion cancelada",
            title: "Sesion cancelada",
            body: "Hemos registrado la cancelacion de tu sesion.",
            url: "/cliente/agenda",
            templateData: {
              calendarSessionId,
              startsAt: session.starts_at
            }
          }
        })
      }
    } catch {
      // La confirmacion al cliente no debe revertir la cancelacion ya auditada.
    }

    return json({
      ok: true,
      session: {
        id: updateResult.data.id,
        status: updateResult.data.status,
        startsAt: updateResult.data.starts_at,
        endsAt: updateResult.data.ends_at
      }
    })
  } catch (error) {
    return json(
      {
        code: "UNEXPECTED",
        message: getSafeMessage(error instanceof Error ? error.message : "Error interno")
      },
      500
    )
  }
}
