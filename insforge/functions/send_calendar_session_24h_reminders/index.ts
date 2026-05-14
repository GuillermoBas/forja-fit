// @ts-nocheck
const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"
const FUNCTIONS_URL = Deno.env.get("INSFORGE_FUNCTIONS_URL") ?? "https://4nc39nmu.functions.insforge.app"

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

function idIn(values: string[]) {
  return `in.(${values.join(",")})`
}

function madridDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date)
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function requireStaffActor(token: string, gymId: string) {
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
    const gymSlug = String(body?.gymSlug ?? "eltemplo")
    const dryRun = body?.dryRun === true
    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    const now = body?.nowIso ? new Date(String(body.nowIso)) : new Date()
    const runForDate = String(body?.runOn ?? madridDateString(now))
    const previousDate = addDays(runForDate, -1)
    const nextDate = addDays(runForDate, 1)
    const broadWindowStart = new Date(`${previousDate}T21:00:00Z`).toISOString()
    const broadWindowEnd = new Date(`${nextDate}T03:00:00Z`).toISOString()

    const trusted = isTrustedToken(token)
    const actor = trusted ? { profile: { id: null, role: "admin" } } : await requireStaffActor(token, gymId)
    if ("error" in actor) {
      return actor.error
    }

    const sessionsResult = await selectRecords("calendar_sessions", token, {
      select: "id,starts_at,trainer_profile_id,client_1_id,client_2_id,status",
      gym_id: `eq.${gymId}`,
      status: "eq.scheduled",
      starts_at: `gte.${broadWindowStart}`
    })

    if (sessionsResult.error) {
      return json({ code: "SESSIONS_LOAD_FAILED", message: sessionsResult.error }, 400)
    }

    const sessions = (sessionsResult.data ?? [])
      .filter((session) => madridDateString(new Date(String(session.starts_at))) === runForDate)
      .filter((session) => new Date(String(session.starts_at)).getTime() < new Date(broadWindowEnd).getTime())
      .filter((session) => new Date(String(session.starts_at)).getTime() > now.getTime())
      .sort((left, right) => String(left.starts_at).localeCompare(String(right.starts_at)))
    const sessionIds = sessions.map((session) => String(session.id))
    const trainerProfileIds = Array.from(
      new Set(
        sessions
          .map((session) => session.trainer_profile_id ? String(session.trainer_profile_id) : "")
          .filter(Boolean)
      )
    )

    const trainerProfilesResult = trainerProfileIds.length
      ? await selectRecords("profiles", token, {
          select: "id,full_name",
          gym_id: `eq.${gymId}`,
          id: idIn(trainerProfileIds)
        })
      : { data: [], error: null }

    if (trainerProfilesResult.error) {
      return json({ code: "TRAINERS_LOAD_FAILED", message: trainerProfilesResult.error }, 400)
    }

    const sessionPasses = sessionIds.length
      ? await selectRecords("calendar_session_passes", token, {
          select: "session_id,pass_id",
          gym_id: `eq.${gymId}`,
          session_id: idIn(sessionIds)
        })
      : { data: [], error: null }

    if (sessionPasses.error) {
      return json({ code: "SESSION_PASSES_LOAD_FAILED", message: sessionPasses.error }, 400)
    }

    const passIds = Array.from(new Set((sessionPasses.data ?? []).map((row) => String(row.pass_id))))
    const holdersResult = passIds.length
      ? await selectRecords("pass_holders", token, {
          select: "pass_id,client_id",
          gym_id: `eq.${gymId}`,
          pass_id: idIn(passIds)
        })
      : { data: [], error: null }

    if (holdersResult.error) {
      return json({ code: "PASS_HOLDERS_LOAD_FAILED", message: holdersResult.error }, 400)
    }

    const passIdsBySession = new Map<string, string[]>()
    for (const row of sessionPasses.data ?? []) {
      const list = passIdsBySession.get(String(row.session_id)) ?? []
      list.push(String(row.pass_id))
      passIdsBySession.set(String(row.session_id), list)
    }

    const holdersByPass = new Map<string, string[]>()
    for (const row of holdersResult.data ?? []) {
      const list = holdersByPass.get(String(row.pass_id)) ?? []
      list.push(String(row.client_id))
      holdersByPass.set(String(row.pass_id), list)
    }

    const trainerNamesById = new Map(
      (trainerProfilesResult.data ?? []).map((row) => [String(row.id), String(row.full_name ?? "").trim()])
    )

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const session of sessions) {
      const clients = new Set<string>()
      for (const passId of passIdsBySession.get(String(session.id)) ?? []) {
        for (const holderId of holdersByPass.get(passId) ?? []) {
          clients.add(holderId)
        }
      }

      if (!clients.size) {
        clients.add(String(session.client_1_id))
        if (session.client_2_id) {
          clients.add(String(session.client_2_id))
        }
      }

      for (const clientId of clients) {
        if (dryRun) {
          skipped += 1
          continue
        }

        const result = await invokeFunction("send_client_communication", token, {
          gymId,
          gymSlug,
          clientIds: [clientId],
          eventType: "calendar_session_24h",
          channels: ["email", "push"],
          dedupeSeed: String(session.id),
          templateData: {
            calendarSessionId: session.id,
            startsAt: session.starts_at,
            trainerName: session.trainer_profile_id
              ? trainerNamesById.get(String(session.trainer_profile_id)) ?? ""
              : ""
          }
        })

        if (result.error) {
          failed += 1
        } else {
          sent += Number(result.data?.sent ?? 0)
          skipped += Number(result.data?.skipped ?? 0)
          failed += Number(result.data?.failed ?? 0)
        }
      }
    }

    return json({
      ok: true,
      runForDate,
      windowStart: broadWindowStart,
      windowEnd: broadWindowEnd,
      candidates: sessions.length,
      dryRun,
      sent,
      skipped,
      failed
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
