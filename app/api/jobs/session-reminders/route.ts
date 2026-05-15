import { NextResponse } from "next/server"

const INSFORGE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL ?? "https://4nc39nmu.eu-central.insforge.app"
const GYM_ID = "e7a9652a-927e-429a-8a9f-1ea1fae6c1d1"
const GYM_SLUG = "eltemplo"

type DbRow = Record<string, any>

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

function idIn(values: string[]) {
  return `in.(${values.join(",")})`
}

async function getRecords(table: string, token: string, params: Record<string, string>) {
  const response = await fetch(`${INSFORGE_URL}/api/database/records/${table}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || data?.error || response.statusText)
  }
  return Array.isArray(data) ? data : data?.value ?? data?.data ?? []
}

async function invokeCommunication(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${INSFORGE_URL}/functions/send_client_communication`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.code) {
    throw new Error(data?.message || data?.error || response.statusText)
  }
  return data
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? ""
    if (!token) {
      return NextResponse.json({ code: "UNAUTHORIZED", message: "Falta token" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const now = body?.nowIso ? new Date(String(body.nowIso)) : new Date()
    const runForDate = String(body?.runOn ?? madridDateString(now))
    const previousDate = addDays(runForDate, -1)
    const nextDate = addDays(runForDate, 1)
    const windowStart = new Date(`${previousDate}T21:00:00Z`).toISOString()
    const windowEnd = new Date(`${nextDate}T03:00:00Z`).toISOString()

    const sessions = (await getRecords("calendar_sessions", token, {
      select: "id,starts_at,trainer_profile_id,client_1_id,client_2_id,status",
      gym_id: `eq.${GYM_ID}`,
      status: "eq.scheduled",
      starts_at: `gte.${windowStart}`,
      limit: "300"
    }))
      .filter((session: DbRow) => madridDateString(new Date(String(session.starts_at))) === runForDate)
      .filter((session: DbRow) => new Date(String(session.starts_at)).getTime() < new Date(windowEnd).getTime())
      .filter((session: DbRow) => new Date(String(session.starts_at)).getTime() > now.getTime())
      .sort((left: DbRow, right: DbRow) => String(left.starts_at).localeCompare(String(right.starts_at)))

    const sessionIds = sessions.map((session: DbRow) => String(session.id))
    const sessionPasses = sessionIds.length
      ? await getRecords("calendar_session_passes", token, {
          select: "session_id,pass_id",
          gym_id: `eq.${GYM_ID}`,
          session_id: idIn(sessionIds),
          limit: "500"
        })
      : []
    const passIds = Array.from(new Set<string>(sessionPasses.map((row: DbRow) => String(row.pass_id))))
    const holders = passIds.length
      ? await getRecords("pass_holders", token, {
          select: "pass_id,client_id",
          gym_id: `eq.${GYM_ID}`,
          pass_id: idIn(passIds),
          limit: "500"
        })
      : []

    const passIdsBySession = new Map<string, string[]>()
    for (const row of sessionPasses) {
      const list = passIdsBySession.get(String(row.session_id)) ?? []
      list.push(String(row.pass_id))
      passIdsBySession.set(String(row.session_id), list)
    }

    const holdersByPass = new Map<string, string[]>()
    for (const row of holders) {
      const list = holdersByPass.get(String(row.pass_id)) ?? []
      list.push(String(row.client_id))
      holdersByPass.set(String(row.pass_id), list)
    }

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const session of sessions) {
      const clientIds = new Set<string>()
      for (const passId of passIdsBySession.get(String(session.id)) ?? []) {
        for (const clientId of holdersByPass.get(passId) ?? []) {
          clientIds.add(clientId)
        }
      }
      if (!clientIds.size) {
        clientIds.add(String(session.client_1_id))
        if (session.client_2_id) clientIds.add(String(session.client_2_id))
      }

      for (const clientId of clientIds) {
        try {
          const result = await invokeCommunication(token, {
            gymId: GYM_ID,
            gymSlug: GYM_SLUG,
            clientIds: [clientId],
            eventType: "calendar_session_24h",
            channels: ["push"],
            dedupeSeed: `${session.id}:${runForDate}`,
            templateData: {
              calendarSessionId: session.id,
              startsAt: session.starts_at,
              trainerName: ""
            }
          })
          sent += Number(result.sent ?? 0)
          skipped += Number(result.skipped ?? 0)
          failed += Number(result.failed ?? 0)
        } catch {
          failed += 1
        }
      }
    }

    return NextResponse.json({ ok: true, runForDate, candidates: sessions.length, sent, skipped, failed })
  } catch (error) {
    return NextResponse.json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}
