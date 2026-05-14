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

function madridDateString(input?: string) {
  if (input) return input

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date())
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function canSendExpiryReminder(pass: Record<string, unknown>) {
  if (pass.sessions_left === null || pass.sessions_left === undefined) {
    return true
  }

  return Number(pass.sessions_left) > 0
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
    const runForDate = madridDateString(body?.runOn)
    const expiresOn = addDays(runForDate, 7)
    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    const trusted = isTrustedToken(token)
    const actor = trusted ? { profile: { id: null, role: "admin" } } : await requireStaffActor(token, gymId)
    if ("error" in actor) {
      return actor.error
    }

    const passesResult = await selectRecords("passes", token, {
      select: "id,pass_type_id,expires_on,sessions_left,status",
      gym_id: `eq.${gymId}`,
      expires_on: `eq.${expiresOn}`,
      status: "in.(active,out_of_sessions)"
    })

    if (passesResult.error) {
      return json({ code: "PASSES_LOAD_FAILED", message: passesResult.error }, 400)
    }

    const activePausesResult = await selectRecords("pass_pauses", token, {
      select: "pass_id",
      gym_id: `eq.${gymId}`,
      starts_on: `lte.${runForDate}`,
      ends_on: `gte.${runForDate}`
    })

    if (activePausesResult.error) {
      return json({ code: "PAUSES_LOAD_FAILED", message: activePausesResult.error }, 400)
    }

    const activePausedPassIds = new Set(
      (activePausesResult.data ?? []).map((pause) => String(pause.pass_id))
    )
    const passRows = (passesResult.data ?? [])
      .filter((pass) => !activePausedPassIds.has(String(pass.id)) && canSendExpiryReminder(pass))
    const passIds = passRows.map((pass) => String(pass.id))
    const passTypeIds = Array.from(new Set(passRows.map((pass) => String(pass.pass_type_id))))

    const [holdersResult, passTypesResult] = await Promise.all([
      passIds.length
        ? selectRecords("pass_holders", token, {
            select: "pass_id,client_id",
            gym_id: `eq.${gymId}`,
            pass_id: idIn(passIds)
          })
        : { data: [], error: null },
      passTypeIds.length
        ? selectRecords("pass_types", token, {
            select: "id,name",
            gym_id: `eq.${gymId}`,
            id: idIn(passTypeIds)
          })
        : { data: [], error: null }
    ])

    if (holdersResult.error || passTypesResult.error) {
      return json(
        {
          code: "D7_CONTEXT_LOAD_FAILED",
          message: holdersResult.error ?? passTypesResult.error
        },
        400
      )
    }

    const passTypeNames = new Map((passTypesResult.data ?? []).map((row) => [String(row.id), String(row.name ?? "Bono")]))
    const holdersByPass = new Map<string, Set<string>>()
    for (const holder of holdersResult.data ?? []) {
      const passId = String(holder.pass_id)
      const holders = holdersByPass.get(passId) ?? new Set()
      holders.add(String(holder.client_id))
      holdersByPass.set(passId, holders)
    }

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const pass of passRows) {
      const holderIds = Array.from(holdersByPass.get(String(pass.id)) ?? [])
      if (!holderIds.length) {
        skipped += 1
        continue
      }

      const result = await invokeFunction("send_client_communication", token, {
        gymId,
        gymSlug,
        clientIds: holderIds,
        passId: pass.id,
        eventType: "pass_expiry_d7",
        channels: ["push"],
        dedupeSeed: `${pass.id}:${pass.expires_on}`,
        templateData: {
          passTypeName: passTypeNames.get(String(pass.pass_type_id)) ?? "Bono",
          expiresOn: pass.expires_on,
          sessionsLeft: pass.sessions_left
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

    return json({
      ok: true,
      runForDate,
      expiresOn,
      candidates: passRows.length,
      passTypeNames: passTypeNames.size,
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
