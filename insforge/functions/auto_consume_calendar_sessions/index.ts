// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"

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

  if (!["admin", "trainer"].includes(String(profileResult.data.role ?? ""))) {
    return { error: json({ code: "FORBIDDEN", message: "No tienes permisos para lanzar este job" }, 403) }
  }

  return { profile: profileResult.data }
}

function parseNow(value?: string) {
  const parsed = value ? new Date(value) : new Date()
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

function chooseConsumptionClientId(session: Record<string, unknown>, holderIds: string[]) {
  const sessionClients = [session.client_1_id, session.client_2_id].filter(Boolean).map(String)
  for (const clientId of sessionClients) {
    if (holderIds.includes(clientId)) {
      return clientId
    }
  }

  return holderIds[0] ?? (session.client_1_id ? String(session.client_1_id) : null)
}

function canMatchManualConsumption(consumedAt: string, session: Record<string, unknown>) {
  const consumedAtTime = new Date(consumedAt).getTime()
  const startsAtTime = new Date(String(session.starts_at)).getTime()
  const endsAtTime = new Date(String(session.ends_at)).getTime()

  return consumedAtTime >= startsAtTime - 6 * 60 * 60 * 1000 &&
    consumedAtTime <= endsAtTime + 12 * 60 * 60 * 1000
}

export default async function(request: Request) {
  try {
    const token = getToken(request)
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const now = parseNow(body?.nowIso)
    if (!now) {
      return json({ code: "INVALID_INPUT", message: "La fecha de referencia no es valida." }, 400)
    }

    const consumeBefore = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const runForDate = madridDateString(now)
    const trusted = isTrustedToken(token)
    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const actor = trusted ? { profile: { id: null, role: "system" } } : await requireStaffActor(client)

    if ("error" in actor) {
      return actor.error
    }

    const startJob = await client.database.from("job_runs").insert([
      {
        job_key: "auto_consume_calendar_sessions",
        run_for_date: runForDate,
        status: "started",
        details: {
          consume_before: consumeBefore
        }
      }
    ]).select("id").single()

    if (startJob.error) {
      if (String(startJob.error.message ?? "").toLowerCase().includes("duplicate")) {
        return json({
          ok: true,
          skipped: true,
          reason: "already_run",
          runForDate
        })
      }

      return json({ code: "JOB_START_FAILED", message: startJob.error.message }, 400)
    }

    const jobRunId = String(startJob.data.id)

    const sessionsResult = await client.database
      .from("calendar_sessions")
      .select("id,trainer_profile_id,client_1_id,client_2_id,pass_id,starts_at,ends_at,status")
      .in("status", ["scheduled", "completed"])
      .lte("ends_at", consumeBefore)
      .order("ends_at", { ascending: true })

    if (sessionsResult.error) {
      await client.database.from("job_runs").update({
        status: "failed",
        details: { error: sessionsResult.error.message }
      }).eq("id", jobRunId)
      return json({ code: "SESSIONS_LOAD_FAILED", message: sessionsResult.error.message }, 400)
    }

    const sessions = sessionsResult.data ?? []
    if (!sessions.length) {
      await client.database.from("job_runs").update({
        status: "completed",
        details: {
          candidates: 0,
          auto_consumed: 0,
          linked_manual: 0,
          updated_sessions: 0,
          skipped: 0
        }
      }).eq("id", jobRunId)

      return json({
        ok: true,
        candidates: 0,
        autoConsumed: 0,
        linkedManual: 0,
        updatedSessions: 0,
        skipped: 0
      })
    }

    const sessionIds = sessions.map((session) => String(session.id))
    const [sessionPassesResult, holdersResult, linkedConsumptionsResult] = await Promise.all([
      client.database.from("calendar_session_passes").select("session_id,pass_id").in("session_id", sessionIds),
      client.database.from("pass_holders").select("pass_id,client_id,holder_order"),
      client.database
        .from("session_consumptions")
        .select("id,pass_id,calendar_session_id,consumed_at,consumption_source")
        .in("calendar_session_id", sessionIds)
    ])

    if (sessionPassesResult.error || holdersResult.error || linkedConsumptionsResult.error) {
      await client.database.from("job_runs").update({
        status: "failed",
        details: {
          error:
            sessionPassesResult.error?.message ??
            holdersResult.error?.message ??
            linkedConsumptionsResult.error?.message ??
            "No se pudieron cargar los datos relacionados"
        }
      }).eq("id", jobRunId)
      return json(
        {
          code: "RELATED_LOAD_FAILED",
          message:
            sessionPassesResult.error?.message ??
            holdersResult.error?.message ??
            linkedConsumptionsResult.error?.message ??
            "No se pudieron cargar los datos relacionados"
        },
        400
      )
    }

    const passIdsBySession = new Map<string, string[]>()
    for (const row of sessionPassesResult.data ?? []) {
      const sessionId = String(row.session_id ?? "")
      const current = passIdsBySession.get(sessionId) ?? []
      current.push(String(row.pass_id ?? ""))
      passIdsBySession.set(sessionId, current)
    }

    for (const session of sessions) {
      const sessionId = String(session.id)
      if (!passIdsBySession.has(sessionId) && session.pass_id) {
        passIdsBySession.set(sessionId, [String(session.pass_id)])
      }
    }

    const allPassIds = Array.from(
      new Set(
        Array.from(passIdsBySession.values()).flatMap((passIds) => passIds.filter(Boolean))
      )
    )

    const [passesResult, passTypesResult, manualConsumptionsResult] = await Promise.all([
      client.database.from("passes").select("id,pass_type_id,status,sessions_left").in("id", allPassIds),
      client.database.from("pass_types").select("id,kind"),
      allPassIds.length
        ? client.database
            .from("session_consumptions")
            .select("id,pass_id,client_id,consumed_at,calendar_session_id,consumption_source")
            .in("pass_id", allPassIds)
            .is("calendar_session_id", null)
            .order("consumed_at", { ascending: true })
        : Promise.resolve({ data: [], error: null })
    ])

    if (passesResult.error || passTypesResult.error || manualConsumptionsResult.error) {
      await client.database.from("job_runs").update({
        status: "failed",
        details: {
          error:
            passesResult.error?.message ??
            passTypesResult.error?.message ??
            manualConsumptionsResult.error?.message ??
            "No se pudieron cargar los bonos"
        }
      }).eq("id", jobRunId)
      return json(
        {
          code: "PASS_DATA_LOAD_FAILED",
          message:
            passesResult.error?.message ??
            passTypesResult.error?.message ??
            manualConsumptionsResult.error?.message ??
            "No se pudieron cargar los bonos"
        },
        400
      )
    }

    const passKindById = new Map(
      (passTypesResult.data ?? []).map((row: Record<string, unknown>) => [
        String(row.id),
        String(row.kind ?? "session")
      ])
    )
    const passById = new Map(
      (passesResult.data ?? []).map((row: Record<string, unknown>) => [
        String(row.id),
        {
          id: String(row.id),
          kind: passKindById.get(String(row.pass_type_id)) ?? "session",
          status: String(row.status ?? "active"),
          sessionsLeft: Number(row.sessions_left ?? 0)
        }
      ])
    )

    const holderIdsByPass = new Map<string, string[]>()
    for (const row of holdersResult.data ?? []) {
      const passId = String(row.pass_id ?? "")
      const current = holderIdsByPass.get(passId) ?? []
      current.push(String(row.client_id ?? ""))
      holderIdsByPass.set(passId, current)
    }

    const linkedKeySet = new Set(
      (linkedConsumptionsResult.data ?? []).map((row: Record<string, unknown>) => `${String(row.calendar_session_id)}:${String(row.pass_id)}`)
    )

    const manualConsumptionsByPass = new Map<string, Array<Record<string, unknown> & { matched?: boolean }>>()
    for (const row of manualConsumptionsResult.data ?? []) {
      const passId = String(row.pass_id ?? "")
      const current = manualConsumptionsByPass.get(passId) ?? []
      current.push({ ...row, matched: false })
      manualConsumptionsByPass.set(passId, current)
    }

    let autoConsumed = 0
    let linkedManual = 0
    let updatedSessions = 0
    let skipped = 0

    for (const session of sessions) {
      const sessionId = String(session.id)
      const passIds = passIdsBySession.get(sessionId) ?? []
      let consumedForSession = false

      for (const passId of passIds) {
        const linkedKey = `${sessionId}:${passId}`
        if (linkedKeySet.has(linkedKey)) {
          consumedForSession = true
          continue
        }

        const pass = passById.get(passId)
        if (!pass || pass.kind !== "session" || ["expired", "cancelled"].includes(pass.status)) {
          skipped += 1
          continue
        }

        const manualMatches = manualConsumptionsByPass.get(passId) ?? []
        const matchedManual = manualMatches.find((consumption) =>
          !consumption.matched &&
          canMatchManualConsumption(String(consumption.consumed_at ?? ""), session)
        )

        if (matchedManual) {
          const linkResult = await client.database
            .from("session_consumptions")
            .update({
              calendar_session_id: sessionId,
              consumption_source: String(matchedManual.consumption_source ?? "manual") || "manual"
            })
            .eq("id", matchedManual.id)

          if (linkResult.error) {
            await client.database.from("job_runs").update({
              status: "failed",
              details: { error: linkResult.error.message }
            }).eq("id", jobRunId)
            return json({ code: "LINK_MANUAL_FAILED", message: linkResult.error.message }, 400)
          }

          matchedManual.matched = true
          linkedKeySet.add(linkedKey)
          linkedManual += 1
          consumedForSession = true
          continue
        }

        const consumptionClientId = chooseConsumptionClientId(session, holderIdsByPass.get(passId) ?? [])
        if (!consumptionClientId) {
          skipped += 1
          continue
        }

        const insertResult = await client.database.from("session_consumptions").insert([
          {
            pass_id: passId,
            client_id: consumptionClientId,
            consumed_at: String(session.ends_at),
            recorded_by_profile_id: session.trainer_profile_id,
            notes: "Consumo automatico desde agenda",
            calendar_session_id: sessionId,
            consumption_source: "auto"
          }
        ])

        if (insertResult.error) {
          await client.database.from("job_runs").update({
            status: "failed",
            details: { error: insertResult.error.message }
          }).eq("id", jobRunId)
          return json({ code: "AUTO_CONSUME_FAILED", message: insertResult.error.message }, 400)
        }

        linkedKeySet.add(linkedKey)
        autoConsumed += 1
        consumedForSession = true
      }

      if (consumedForSession && String(session.status) === "scheduled") {
        const completeResult = await client.database
          .from("calendar_sessions")
          .update({
            status: "completed",
            updated_at: now.toISOString()
          })
          .eq("id", sessionId)

        if (completeResult.error) {
          await client.database.from("job_runs").update({
            status: "failed",
            details: { error: completeResult.error.message }
          }).eq("id", jobRunId)
          return json({ code: "SESSION_COMPLETE_FAILED", message: completeResult.error.message }, 400)
        }

        updatedSessions += 1
      }
    }

    await client.database.from("job_runs").update({
      status: "completed",
      details: {
        candidates: sessions.length,
        auto_consumed: autoConsumed,
        linked_manual: linkedManual,
        updated_sessions: updatedSessions,
        skipped
      }
    }).eq("id", jobRunId)

    if (actor.profile.id) {
      await client.database.from("audit_logs").insert([
        {
          actor_profile_id: actor.profile.id,
          entity_name: "job_runs",
          entity_id: jobRunId,
          action: "update",
          diff: {
            candidates: sessions.length,
            auto_consumed: autoConsumed,
            linked_manual: linkedManual,
            updated_sessions: updatedSessions,
            skipped
          }
        }
      ])
    }

    return json({
      ok: true,
      candidates: sessions.length,
      autoConsumed,
      linkedManual,
      updatedSessions,
      skipped
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
