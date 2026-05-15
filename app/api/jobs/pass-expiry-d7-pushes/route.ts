import { NextResponse } from "next/server"

const INSFORGE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL ?? "https://4nc39nmu.eu-central.insforge.app"
const GYM_ID = "e7a9652a-927e-429a-8a9f-1ea1fae6c1d1"
const GYM_SLUG = "eltemplo"

type DbRow = Record<string, any>

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
    const runForDate = madridDateString(body?.runOn ? String(body.runOn) : undefined)
    const expiresOn = addDays(runForDate, 7)

    const passes = (await getRecords("passes", token, {
      select: "id,pass_type_id,expires_on,sessions_left,status",
      gym_id: `eq.${GYM_ID}`,
      expires_on: `eq.${expiresOn}`,
      status: "in.(active,out_of_sessions)",
      limit: "300"
    })).filter((pass: DbRow) => pass.sessions_left === null || pass.sessions_left === undefined || Number(pass.sessions_left) > 0)

    const passIds = passes.map((pass: DbRow) => String(pass.id))
    const passTypeIds = Array.from(new Set<string>(passes.map((pass: DbRow) => String(pass.pass_type_id))))
    const [holders, passTypes] = await Promise.all([
      passIds.length
        ? getRecords("pass_holders", token, {
            select: "pass_id,client_id",
            gym_id: `eq.${GYM_ID}`,
            pass_id: idIn(passIds),
            limit: "500"
          })
        : [],
      passTypeIds.length
        ? getRecords("pass_types", token, {
            select: "id,name",
            gym_id: `eq.${GYM_ID}`,
            id: idIn(passTypeIds),
            limit: "100"
          })
        : []
    ])

    const passTypeNames = new Map(passTypes.map((row: DbRow) => [String(row.id), String(row.name ?? "Bono")]))
    const holdersByPass = new Map<string, Set<string>>()
    for (const holder of holders) {
      const set = holdersByPass.get(String(holder.pass_id)) ?? new Set<string>()
      set.add(String(holder.client_id))
      holdersByPass.set(String(holder.pass_id), set)
    }

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const pass of passes) {
      const clientIds = Array.from(holdersByPass.get(String(pass.id)) ?? [])
      if (!clientIds.length) {
        skipped += 1
        continue
      }
      try {
        const result = await invokeCommunication(token, {
          gymId: GYM_ID,
          gymSlug: GYM_SLUG,
          clientIds,
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
        sent += Number(result.sent ?? 0)
        skipped += Number(result.skipped ?? 0)
        failed += Number(result.failed ?? 0)
      } catch {
        failed += clientIds.length
      }
    }

    return NextResponse.json({ ok: true, runForDate, expiresOn, candidates: passes.length, sent, skipped, failed })
  } catch (error) {
    return NextResponse.json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    )
  }
}
