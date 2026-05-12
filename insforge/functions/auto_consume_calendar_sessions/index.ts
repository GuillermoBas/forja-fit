// @ts-nocheck
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

function parseDateInput(value?: string) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

function madridDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date)
}

function madridHourSlot(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ""

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}`
}

function rangeSlot(from: Date, before: Date) {
  return `range-${madridHourSlot(from)}-${madridHourSlot(before)}`
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
    return {
      data: null,
      error: data?.message || data?.error || response.statusText
    }
  }

  return { data, error: null }
}

async function requireStaffActor(token: string, gymId: string) {
  const authResult = await insforgeFetch("/api/auth/sessions/current", token)
  if (authResult.error || !authResult.data?.user) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
  }

  const params = new URLSearchParams({
    select: "*",
    auth_user_id: `eq.${authResult.data.user.id}`,
    gym_id: `eq.${gymId}`,
    limit: "1"
  })
  const profileResult = await insforgeFetch(`/api/database/records/profiles?${params}`, token)
  const profile = Array.isArray(profileResult.data) ? profileResult.data[0] : null

  if (profileResult.error || !profile) {
    return { error: json({ code: "PROFILE_REQUIRED", message: "Perfil no encontrado" }, 403) }
  }

  if (profile.role !== "admin" && profile.role !== "trainer") {
    return { error: json({ code: "FORBIDDEN", message: "No tienes permisos para lanzar este job" }, 403) }
  }

  return { profile }
}

export default async function(request: Request) {
  try {
    const token = getToken(request)
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const gymId = String(body?.gymId ?? "")
    const now = parseDateInput(body?.nowIso) ?? new Date()
    const requestedConsumeBefore = parseDateInput(body?.consumeBeforeIso)
    const requestedConsumeFrom = parseDateInput(body?.consumeFromIso)
    const consumeBeforeDate = requestedConsumeBefore ?? new Date(now.getTime() - 60 * 60 * 1000)
    const consumeFromDate = requestedConsumeFrom ?? new Date(consumeBeforeDate.getTime() - 60 * 60 * 1000)

    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    if (consumeFromDate >= consumeBeforeDate) {
      return json({ code: "INVALID_INPUT", message: "La ventana de consumo no es valida." }, 400)
    }

    const trusted = isTrustedToken(token)
    const actor = trusted ? { profile: { id: null, role: "system" } } : await requireStaffActor(token, gymId)

    if ("error" in actor) {
      return actor.error
    }

    const runSlot = requestedConsumeBefore || requestedConsumeFrom
      ? rangeSlot(consumeFromDate, consumeBeforeDate)
      : madridHourSlot(now)

    const rpcResult = await insforgeFetch(
      "/api/database/rpc/app_auto_consume_calendar_sessions",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          p_gym_id: gymId,
          p_consume_from: consumeFromDate.toISOString(),
          p_consume_before: consumeBeforeDate.toISOString(),
          p_run_for_date: madridDateString(now),
          p_run_slot: runSlot,
          p_now: now.toISOString(),
          p_actor_profile_id: actor.profile.id
        })
      }
    )

    if (rpcResult.error) {
      return json({ code: "AUTO_CONSUME_FAILED", message: rpcResult.error }, 400)
    }

    return json(rpcResult.data ?? { ok: true })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
