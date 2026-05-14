// @ts-nocheck
const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"
const FUNCTIONS_URL = Deno.env.get("INSFORGE_FUNCTIONS_URL") ?? "https://4nc39nmu.functions.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

async function insforgeFetch(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
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

async function invokeFunction(slug: string, token: string, body: Record<string, unknown>) {
  const response = await fetch(`${FUNCTIONS_URL}/${slug}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
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

async function selectRecords(table: string, token: string, params: Record<string, string>) {
  return insforgeFetch(`/api/database/records/${table}?${new URLSearchParams(params)}`, token)
}

function normalizeReminderType(reminderType: string) {
  if (reminderType === "expiry_reminder_d7" || reminderType === "pass_expiry_d7") return "pass_expiry_d7"
  if (reminderType === "expiry_reminder_d0" || reminderType === "pass_expiry_d0") return "pass_expiry_d0"
  return ""
}

function canSendExpiryReminder(pass: Record<string, unknown>) {
  if (pass.sessions_left === null || pass.sessions_left === undefined) {
    return true
  }

  return Number(pass.sessions_left) > 0
}

async function getActor(token: string, gymId: string) {
  const authResult = await insforgeFetch("/api/auth/sessions/current", token)
  if (authResult.error || !authResult.data?.user) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
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

  if (profile.role !== "admin") {
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede lanzar emails de caducidad" }, 403) }
  }

  return { profile }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const gymId = String(body?.gymId ?? "")
    const gymSlug = String(body?.gymSlug ?? "eltemplo")
    const eventType = normalizeReminderType(String(body?.reminderType ?? ""))
    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    if (!body?.passId || !eventType) {
      return json({ code: "INVALID_INPUT", message: "Pass y reminderType son obligatorios" }, 400)
    }

    const actor = await getActor(token, gymId)
    if (actor.error) {
      return actor.error
    }

    const [passResult, holdersResult] = await Promise.all([
      selectRecords("passes", token, {
        select: "id,pass_type_id,expires_on,sessions_left",
        gym_id: `eq.${gymId}`,
        id: `eq.${body.passId}`,
        limit: "1"
      }),
      selectRecords("pass_holders", token, {
        select: "client_id",
        gym_id: `eq.${gymId}`,
        pass_id: `eq.${body.passId}`
      })
    ])

    const pass = Array.isArray(passResult.data) ? passResult.data[0] : null
    if (passResult.error || !pass) {
      return json({ code: "NOT_FOUND", message: "Bono no encontrado" }, 404)
    }

    if (!canSendExpiryReminder(pass)) {
      return json({ ok: true, skipped: true, reason: "pass_out_of_sessions" })
    }

    const holderIds = (holdersResult.data ?? []).map((holder) => String(holder.client_id))
    if (!holderIds.length) {
      return json({ ok: true, skipped: true, reason: "no_holders" })
    }

    const passTypeResult = await selectRecords("pass_types", token, {
      select: "name",
      gym_id: `eq.${gymId}`,
      id: `eq.${pass.pass_type_id}`,
      limit: "1"
    })
    const passType = Array.isArray(passTypeResult.data) ? passTypeResult.data[0] : null

    const sendResult = await invokeFunction("send_client_communication", token, {
      gymId,
      gymSlug,
      clientIds: holderIds,
      passId: pass.id,
      eventType,
      channels: ["email"],
      dedupeSeed: `${pass.id}:${pass.expires_on}`,
      templateData: {
        passTypeName: passType?.name ?? "Bono",
        expiresOn: pass.expires_on,
        sessionsLeft: pass.sessions_left
      }
    })

    if (sendResult.error) {
      return json({ code: "SEND_FAILED", message: sendResult.error }, 400)
    }

    return json(sendResult.data ?? { ok: true })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
