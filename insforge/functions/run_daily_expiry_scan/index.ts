// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
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
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede lanzar el job diario" }, 403) }
  }

  return { profile: profileResult.data }
}

async function loadPassContext(client: any, passIds: string[]) {
  if (!passIds.length) {
    return { passTypes: new Map(), holdersByPass: new Map() }
  }

  const passTypeIds = new Set<string>()
  const passesResult = await client.database.from("passes").select("id,pass_type_id").in("id", passIds)
  if (passesResult.error) {
    throw new Error(passesResult.error.message)
  }

  for (const row of passesResult.data ?? []) {
    passTypeIds.add(String(row.pass_type_id))
  }

  const [holdersResult, passTypesResult] = await Promise.all([
    client.database.from("pass_holders").select("pass_id,client_id").in("pass_id", passIds),
    passTypeIds.size
      ? client.database.from("pass_types").select("id,name").in("id", Array.from(passTypeIds))
      : { data: [], error: null }
  ])

  if (holdersResult.error || passTypesResult.error) {
    throw new Error(holdersResult.error?.message ?? passTypesResult.error?.message ?? "No se pudo cargar contexto de bonos")
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

async function sendExpiryCommunication(client: any, pass: Record<string, unknown>, eventType: string, context: any) {
  const passId = String(pass.id)
  const holderIds = context.holdersByPass.get(passId) ?? []
  if (!holderIds.length) {
    return { skipped: true, reason: "no_holders" }
  }

  const result = await client.functions.invoke("send_client_communication", {
    body: {
      clientIds: holderIds,
      passId,
      eventType,
      channels: ["email", "push"],
      dedupeSeed: `${passId}:${pass.expires_on}`,
      templateData: {
        passTypeName: context.passTypes.get(String(pass.pass_type_id)) ?? "Bono",
        expiresOn: pass.expires_on,
        sessionsLeft: pass.sessions_left
      }
    }
  })

  if (result.error) {
    return { failed: true, reason: result.error.message }
  }

  return result.data ?? { ok: true }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const runForDate = madridDateString(body?.runOn)
    const d7Date = addDays(runForDate, 7)

    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const startJob = await client.database.from("job_runs").insert([
      {
        job_key: "daily_expiry_scan",
        run_for_date: runForDate,
        status: "started",
        details: { timezone: "Europe/Madrid" }
      }
    ]).select("id").single()

    if (startJob.error) {
      if (String(startJob.error.message ?? "").toLowerCase().includes("duplicate")) {
        await client.database.from("audit_logs").insert([
          {
            actor_profile_id: actor.profile.id,
            entity_name: "job_runs",
            entity_id: null,
            action: "update",
            diff: {
              job_key: "daily_expiry_scan",
              run_for_date: runForDate,
              skipped: true,
              reason: "already_run"
            }
          }
        ])

        return json({ ok: true, skipped: true, reason: "already_run", runForDate })
      }

      return json({ code: "DB_ERROR", message: startJob.error.message }, 400)
    }

    const jobRunId = String(startJob.data.id)

    try {
      const [d7PassesResult, d0PassesResult] = await Promise.all([
        client.database
          .from("passes")
          .select("id,pass_type_id,expires_on,sessions_left,status")
          .eq("expires_on", d7Date)
          .in("status", ["active", "paused", "out_of_sessions"]),
        client.database
          .from("passes")
          .select("id,pass_type_id,expires_on,sessions_left,status")
          .eq("expires_on", runForDate)
          .in("status", ["active", "paused", "out_of_sessions"])
      ])

      if (d7PassesResult.error || d0PassesResult.error) {
        throw new Error(d7PassesResult.error?.message ?? d0PassesResult.error?.message ?? "No se pudieron cargar bonos")
      }

      const d7Passes = (d7PassesResult.data ?? []) as Array<Record<string, unknown>>
      const d0Passes = (d0PassesResult.data ?? []) as Array<Record<string, unknown>>
      const passIds = Array.from(new Set([...d7Passes, ...d0Passes].map((pass) => String(pass.id))))
      const context = await loadPassContext(client, passIds)
      const summary = {
        d7Candidates: d7Passes.length,
        d0Candidates: d0Passes.length,
        sent: 0,
        skipped: 0,
        failed: 0,
        expired: 0
      }

      for (const pass of d7Passes) {
        const result = await sendExpiryCommunication(client, pass, "pass_expiry_d7", context)
        summary.sent += Number(result.sent ?? 0)
        summary.skipped += Number(result.skipped ?? (result.skipped === true ? 1 : 0))
        summary.failed += Number(result.failed ?? (result.failed === true ? 1 : 0))
      }

      for (const pass of d0Passes) {
        const result = await sendExpiryCommunication(client, pass, "pass_expiry_d0", context)
        summary.sent += Number(result.sent ?? 0)
        summary.skipped += Number(result.skipped ?? (result.skipped === true ? 1 : 0))
        summary.failed += Number(result.failed ?? (result.failed === true ? 1 : 0))
      }

      const expireResult = await client.database
        .from("passes")
        .update({ status: "expired" })
        .lt("expires_on", runForDate)
        .in("status", ["active", "paused", "out_of_sessions"])
        .select("id")

      if (expireResult.error) {
        throw new Error(expireResult.error.message)
      }

      summary.expired = (expireResult.data ?? []).length

      const completeResult = await client.database
        .from("job_runs")
        .update({ status: "completed", details: summary })
        .eq("id", jobRunId)

      if (completeResult.error) {
        throw new Error(completeResult.error.message)
      }

      await client.database.from("audit_logs").insert([
        {
          actor_profile_id: actor.profile.id,
          entity_name: "job_runs",
          entity_id: jobRunId,
          action: "update",
          diff: summary
        }
      ])

      return json({ ok: true, runForDate, ...summary })
    } catch (jobError) {
      await client.database.from("audit_logs").insert([
        {
          actor_profile_id: actor.profile.id,
          entity_name: "job_runs",
          entity_id: jobRunId,
          action: "update",
          diff: {
            status: "failed",
            error: jobError instanceof Error ? jobError.message : "unknown_error"
          }
        }
      ])

      await client.database
        .from("job_runs")
        .update({
          status: "failed",
          details: { error: jobError instanceof Error ? jobError.message : "unknown_error" }
        })
        .eq("id", jobRunId)

      throw jobError
    }
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
