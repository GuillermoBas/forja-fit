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

function formatDateEs(dateString: string) {
  const [year, month, day] = dateString.slice(0, 10).split("-")
  if (year && month && day) {
    return `${day}/${month}/${year}`
  }
  return dateString
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

  return { profile: profileResult.data }
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

export default async function(request: Request) {
  try {
    const token = getToken(request)
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const runForDate = madridDateString(body?.runOn)
    const expiresOn = addDays(runForDate, 7)

    const trusted = isTrustedToken(token)
    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const actor = trusted ? { profile: { id: null, role: "admin" } } : await requireStaffActor(client)
    if ("error" in actor) {
      return actor.error
    }

    const passesResult = await client.database
      .from("passes")
      .select("id,pass_type_id,expires_on,sessions_left,status")
      .eq("expires_on", expiresOn)
      .in("status", ["active", "paused", "out_of_sessions"])

    if (passesResult.error) {
      return json({ code: "PASSES_LOAD_FAILED", message: passesResult.error.message }, 400)
    }

    const passRows = passesResult.data ?? []
    const passIds = passRows.map((pass) => String(pass.id))
    const passTypeIds = Array.from(new Set(passRows.map((pass) => String(pass.pass_type_id))))

    const [holdersResult, passTypesResult] = await Promise.all([
      passIds.length
        ? client.database.from("pass_holders").select("pass_id,client_id").in("pass_id", passIds)
        : { data: [], error: null },
      passTypeIds.length
        ? client.database.from("pass_types").select("id,name").in("id", passTypeIds)
        : { data: [], error: null }
    ])

    if (holdersResult.error || passTypesResult.error) {
      return json(
        {
          code: "D7_CONTEXT_LOAD_FAILED",
          message: holdersResult.error?.message ?? passTypesResult.error?.message
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
      for (const clientId of holderIds) {
        const dedupeKey = `pass_expiry_d7:${pass.id}:${clientId}:${pass.expires_on}`
        const sessionsLeft = pass.sessions_left ?? 0
        const result = await client.functions.invoke("send_push_to_client", {
          body: {
            clientId,
            passId: pass.id,
            eventType: "pass_expiry_d7",
            dedupeKey,
            title: "Tu bono caduca en 7 dias",
            body: `Te quedan ${sessionsLeft} sesiones. Caduca el ${formatDateEs(String(pass.expires_on))}.`,
            url: "/cliente/dashboard"
          }
        })

        if (result.error) {
          failed += 1
        } else if (result.data?.skipped) {
          skipped += 1
        } else {
          sent += Number(result.data?.sent ?? 0) > 0 ? 1 : 0
          if (Number(result.data?.sent ?? 0) <= 0) skipped += 1
        }
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
