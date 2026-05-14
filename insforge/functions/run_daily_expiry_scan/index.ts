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

function madridDateString(input?: string) {
  if (input) return input

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date())
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
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede lanzar el job diario" }, 403) }
  }

  return { profile }
}

async function callRpc(token: string, name: string, body: Record<string, unknown>) {
  return insforgeFetch(`/api/database/rpc/${name}`, token, {
    method: "POST",
    body: JSON.stringify(body)
  })
}

async function loadPassContext(token: string, gymId: string, passIds: string[]) {
  if (!passIds.length) {
    return { passTypes: new Map(), holdersByPass: new Map() }
  }

  const passTypeIds = new Set<string>()
  const passesResult = await selectRecords("passes", token, {
    select: "id,pass_type_id",
    gym_id: `eq.${gymId}`,
    id: idIn(passIds)
  })
  if (passesResult.error) {
    throw new Error(passesResult.error)
  }

  for (const row of passesResult.data ?? []) {
    passTypeIds.add(String(row.pass_type_id))
  }

  const [holdersResult, passTypesResult] = await Promise.all([
    selectRecords("pass_holders", token, {
      select: "pass_id,client_id",
      gym_id: `eq.${gymId}`,
      pass_id: idIn(passIds)
    }),
    passTypeIds.size
      ? selectRecords("pass_types", token, {
          select: "id,name",
          gym_id: `eq.${gymId}`,
          id: idIn(Array.from(passTypeIds))
        })
      : { data: [], error: null }
  ])

  if (holdersResult.error || passTypesResult.error) {
    throw new Error(holdersResult.error ?? passTypesResult.error ?? "No se pudo cargar contexto de bonos")
  }

  const holdersByPass = new Map<string, string[]>()
  for (const row of holdersResult.data ?? []) {
    const passId = String(row.pass_id)
    const holders = holdersByPass.get(passId) ?? []
    holders.push(String(row.client_id))
    holdersByPass.set(passId, holders)
  }

  const passTypes = new Map((passTypesResult.data ?? []).map((row) => [String(row.id), String(row.name ?? "Bono")]))
  return { passTypes, holdersByPass }
}

async function sendExpiryCommunication(token: string, gymId: string, gymSlug: string, pass: Record<string, unknown>, eventType: string, context: any) {
  const passId = String(pass.id)
  const holderIds = context.holdersByPass.get(passId) ?? []
  if (!holderIds.length) {
    return { skipped: true, reason: "no_holders" }
  }

  const result = await invokeFunction("send_client_communication", token, {
    clientIds: holderIds,
    gymId,
    gymSlug,
    passId,
    eventType,
    channels: ["email", "push"],
    dedupeSeed: `${passId}:${pass.expires_on}`,
    templateData: {
      passTypeName: context.passTypes.get(String(pass.pass_type_id)) ?? "Bono",
      expiresOn: pass.expires_on,
      sessionsLeft: pass.sessions_left
    }
  })

  if (result.error) {
    return { failed: true, reason: result.error }
  }

  return result.data ?? { ok: true }
}

export default async function(request: Request) {
  let token = ""
  let gymId = ""
  let actorProfileId = null
  let jobRunId = null

  try {
    token = getToken(request)
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    gymId = String(body?.gymId ?? "")
    const runForDate = madridDateString(body?.runOn)
    const gymSlug = String(body?.gymSlug ?? "eltemplo")

    const trusted = isTrustedToken(token)
    const actor = trusted ? { profile: { id: null, role: "system" } } : await getActor(token, gymId)
    if (actor.error) {
      return actor.error
    }
    actorProfileId = actor.profile.id

    const prepareResult = await callRpc(token, "app_prepare_daily_expiry_scan", {
      p_gym_id: gymId,
      p_run_for_date: runForDate,
      p_actor_profile_id: actorProfileId
    })

    if (prepareResult.error) {
      return json({ code: "DB_ERROR", message: prepareResult.error }, 400)
    }

    if (prepareResult.data?.skipped) {
      return json(prepareResult.data)
    }

    jobRunId = String(prepareResult.data?.jobRunId ?? "")
    const d7Passes = Array.isArray(prepareResult.data?.d7Passes) ? prepareResult.data.d7Passes : []
    const d0Passes = Array.isArray(prepareResult.data?.d0Passes) ? prepareResult.data.d0Passes : []
    const passIds = Array.from(new Set([...d7Passes, ...d0Passes].map((pass) => String(pass.id))))
    const context = await loadPassContext(token, gymId, passIds)
    const summary = {
      ...(prepareResult.data?.summary ?? {}),
      sent: 0,
      skipped: 0,
      failed: 0
    }

    for (const pass of d7Passes) {
      const result = await sendExpiryCommunication(token, gymId, gymSlug, pass, "pass_expiry_d7", context)
      summary.sent += Number(result.sent ?? 0)
      summary.skipped += Number(result.skipped ?? (result.skipped === true ? 1 : 0))
      summary.failed += Number(result.failed ?? (result.failed === true ? 1 : 0))
    }

    for (const pass of d0Passes) {
      const result = await sendExpiryCommunication(token, gymId, gymSlug, pass, "pass_expiry_d0", context)
      summary.sent += Number(result.sent ?? 0)
      summary.skipped += Number(result.skipped ?? (result.skipped === true ? 1 : 0))
      summary.failed += Number(result.failed ?? (result.failed === true ? 1 : 0))
    }

    const finishResult = await callRpc(token, "app_finish_daily_expiry_scan", {
      p_gym_id: gymId,
      p_job_run_id: jobRunId,
      p_actor_profile_id: actorProfileId,
      p_summary: summary
    })

    if (finishResult.error) {
      return json({ code: "DB_ERROR", message: finishResult.error }, 400)
    }

    return json({ ok: true, runForDate, ...summary })
  } catch (error) {
    if (token && gymId && jobRunId) {
      await callRpc(token, "app_finish_daily_expiry_scan", {
        p_gym_id: gymId,
        p_job_run_id: jobRunId,
        p_actor_profile_id: actorProfileId,
        p_error: error instanceof Error ? error.message : "unknown_error"
      }).catch(() => null)
    }

    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
