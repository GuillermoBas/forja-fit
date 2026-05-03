// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
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

  return { profile: profileResult.data }
}

function isValidScheduleEntry(entry: unknown) {
  if (!entry || typeof entry !== "object") {
    return false
  }

  const value = entry as Record<string, unknown>
  const weekday = Number(value.weekday)
  const hour = String(value.hour ?? "")
  const trainerProfileId = String(value.trainerProfileId ?? "")

  return (
    Number.isInteger(weekday)
    && weekday >= 1
    && weekday <= 7
    && /^([01]\d|2[0-3]):00$/.test(hour)
    && Boolean(trainerProfileId)
  )
}

function normalizeScheduleEntries(entries: Array<Record<string, unknown>>) {
  return entries.map((entry) => ({
    weekday: Number(entry.weekday),
    hour: String(entry.hour ?? ""),
    trainer_profile_id: String(entry.trainerProfileId ?? entry.trainer_profile_id ?? "")
  }))
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    const rawEntries = Array.isArray(body?.entries) ? body.entries : []

    if (!body?.passId || !body?.startOn || !rawEntries.length) {
      return json({ code: "INVALID_INPUT", message: "Faltan datos del patron semanal" }, 400)
    }

    const mode = body?.mode === "pending" ? "pending" : "all"

    if (rawEntries.length > 30 || rawEntries.some((entry) => !isValidScheduleEntry(entry))) {
      return json({ code: "INVALID_INPUT", message: "El patron semanal no es valido" }, 400)
    }

    const entries = normalizeScheduleEntries(rawEntries as Array<Record<string, unknown>>)

    const uniqueKeys = new Set<string>()
    for (const entry of entries) {
      const key = `${entry.weekday}-${entry.hour}-${entry.trainer_profile_id}`
      if (uniqueKeys.has(key)) {
        return json(
          { code: "INVALID_INPUT", message: "El patron semanal no puede contener filas duplicadas" },
          400
        )
      }
      uniqueKeys.add(key)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await client.database.rpc("app_schedule_pass_sessions", {
      p_actor_profile_id: actor.profile.id,
      p_pass_id: body.passId,
      p_start_on: body.startOn,
      p_entries: entries,
      p_mode: mode
    })

    if (rpcResult.error) {
      return json({ code: "DB_ERROR", message: rpcResult.error.message }, 400)
    }

    return json({
      ok: true,
      scheduledCount: Number(rpcResult.data ?? 0)
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
