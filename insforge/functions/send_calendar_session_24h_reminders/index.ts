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

function formatTimeEs(isoString: string) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(isoString))
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

export default async function(request: Request) {
  try {
    const token = getToken(request)
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const now = new Date()
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString()
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString()

    const trusted = isTrustedToken(token)
    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const actor = trusted ? { profile: { id: null, role: "admin" } } : await requireStaffActor(client)
    if ("error" in actor) {
      return actor.error
    }

    const sessionsResult = await client.database
      .from("calendar_sessions")
      .select("id,starts_at,client_1_id,client_2_id,status")
      .eq("status", "scheduled")
      .gte("starts_at", windowStart)
      .lt("starts_at", windowEnd)

    if (sessionsResult.error) {
      return json({ code: "SESSIONS_LOAD_FAILED", message: sessionsResult.error.message }, 400)
    }

    const sessions = sessionsResult.data ?? []
    const sessionIds = sessions.map((session) => String(session.id))

    const sessionPasses = sessionIds.length
      ? await client.database
          .from("calendar_session_passes")
          .select("session_id,pass_id")
          .in("session_id", sessionIds)
      : { data: [], error: null }

    if (sessionPasses.error) {
      return json({ code: "SESSION_PASSES_LOAD_FAILED", message: sessionPasses.error.message }, 400)
    }

    const passIds = Array.from(new Set((sessionPasses.data ?? []).map((row) => String(row.pass_id))))
    const holdersResult = passIds.length
      ? await client.database.from("pass_holders").select("pass_id,client_id").in("pass_id", passIds)
      : { data: [], error: null }

    if (holdersResult.error) {
      return json({ code: "PASS_HOLDERS_LOAD_FAILED", message: holdersResult.error.message }, 400)
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
        const result = await client.functions.invoke("send_push_to_client", {
          body: {
            clientId,
            eventType: "calendar_session_24h",
            dedupeKey: `calendar_session_24h:${session.id}:${clientId}`,
            title: "Recuerda tu sesion de manana",
            body: `Tienes una sesion programada a las ${formatTimeEs(String(session.starts_at))}.`,
            url: "/cliente/actividad"
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
      windowStart,
      windowEnd,
      candidates: sessions.length,
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
