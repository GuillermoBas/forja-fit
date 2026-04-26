// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"
const MAX_EMAILS_PER_RUN = 10

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function madridDateString(input?: string) {
  if (input) {
    return input
  }

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

async function getPassMap(client: any, passIds: string[]) {
  if (!passIds.length) {
    return new Map()
  }

  const [passesResult, holdersResult] = await Promise.all([
    client.database.from("passes").select("*").in("id", passIds),
    client.database
      .from("pass_holders")
      .select("pass_id,client_id,holder_order")
      .in("pass_id", passIds)
  ])

  if (passesResult.error || !passesResult.data || holdersResult.error || !holdersResult.data) {
    throw new Error(
      passesResult.error?.message ??
      holdersResult.error?.message ??
      "No se pudieron cargar los bonos"
    )
  }

  const primaryHolderMap = new Map<string, string>()

  for (const row of holdersResult.data as Array<Record<string, unknown>>) {
    if (Number(row.holder_order ?? 0) !== 1) {
      continue
    }
    primaryHolderMap.set(String(row.pass_id ?? ""), String(row.client_id ?? ""))
  }

  return new Map((passesResult.data as Array<Record<string, unknown>>).map((row) => [
    String(row.id),
    {
      ...row,
      primary_holder_client_id: primaryHolderMap.get(String(row.id)) ?? null
    }
  ]))
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

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

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
          .select("id,expires_on,status")
          .eq("expires_on", d7Date)
          .in("status", ["active", "paused", "out_of_sessions"]),
        client.database
          .from("passes")
          .select("id,expires_on,status")
          .eq("expires_on", runForDate)
          .in("status", ["active", "paused", "out_of_sessions"])
      ])

      if (d7PassesResult.error || d0PassesResult.error) {
        throw new Error(d7PassesResult.error?.message ?? d0PassesResult.error?.message ?? "No se pudieron cargar bonos")
      }

      let attemptedEmails = 0
      const summary = {
        d7Candidates: (d7PassesResult.data ?? []).length,
        d0Candidates: (d0PassesResult.data ?? []).length,
        attemptedEmails: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        expired: 0
      }

      for (const candidate of [
        ...((d7PassesResult.data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
          passId: String(row.id),
          reminderType: "expiry_reminder_d7"
        })),
        ...((d0PassesResult.data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
          passId: String(row.id),
          reminderType: "expiry_reminder_d0"
        }))
      ]) {
        const existingLog = await client.database
          .from("notification_log")
          .select("id,status")
          .eq("pass_id", candidate.passId)
          .eq("channel", "email")
          .eq("event_type", candidate.reminderType)
          .limit(1)
          .maybeSingle()

        if (!existingLog.error && existingLog.data?.id) {
          summary.skipped += 1
          continue
        }

        if (attemptedEmails >= MAX_EMAILS_PER_RUN) {
          const passMap = await getPassMap(client, [candidate.passId])
          const passRow = passMap.get(candidate.passId)
          await client.database.from("notification_log").insert([
            {
              client_id: passRow?.primary_holder_client_id ?? null,
              pass_id: candidate.passId,
              channel: "email",
              event_type: candidate.reminderType,
              status: "skipped",
              subject: "Email omitido por throttling",
              body: "Se ha omitido el envío para respetar el límite horario de emails.",
              payload: { throttled: true, job_run_id: jobRunId },
              error_message: "throttled_hourly_limit"
            }
          ])
          summary.skipped += 1
          continue
        }

        attemptedEmails += 1
        summary.attemptedEmails = attemptedEmails

        const sendResult = await client.functions.invoke("send_expiry_email", {
          body: {
            passId: candidate.passId,
            reminderType: candidate.reminderType
          }
        })

        if (sendResult.error) {
          summary.failed += 1
          continue
        }

        if (sendResult.data?.skipped) {
          summary.skipped += 1
        } else {
          summary.sent += 1
        }
      }

      const expireResult = await client.database
        .from("passes")
        .update({ status: "expired" })
        .eq("expires_on", runForDate)
        .in("status", ["active", "paused", "out_of_sessions"])
        .select("id")

      if (expireResult.error) {
        throw new Error(expireResult.error.message)
      }

      summary.expired = (expireResult.data ?? []).length

      const completeResult = await client.database
        .from("job_runs")
        .update({
          status: "completed",
          details: summary
        })
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

      return json({
        ok: true,
        runForDate,
        ...summary
      })
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
          details: {
            error: jobError instanceof Error ? jobError.message : "unknown_error"
          }
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
