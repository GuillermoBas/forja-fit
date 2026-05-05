// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"

const allowedKeys = new Set([
  "height_cm",
  "weight_kg",
  "goal",
  "meals_per_day",
  "dietary_pattern",
  "intermittent_fasting",
  "allergies",
  "intolerances",
  "foods_to_avoid",
  "preferred_foods",
  "usual_schedule"
])

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function normalizeText(value: unknown) {
  if (value === null) return null
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed.slice(0, 600) : null
}

function normalizeNumber(value: unknown, min: number, max: number) {
  if (value === null) return null
  if (typeof value !== "number" || Number.isNaN(value)) return undefined
  if (value < min || value > max) return undefined
  return Number(value.toFixed(2))
}

function normalizeInteger(value: unknown, min: number, max: number) {
  if (value === null) return null
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined
  if (value < min || value > max) return undefined
  return value
}

function normalizeBoolean(value: unknown) {
  if (value === null) return null
  if (typeof value !== "boolean") return undefined
  return value
}

function validatePatch(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}

  for (const [key, rawValue] of Object.entries(input)) {
    if (!allowedKeys.has(key)) {
      continue
    }

    let normalized

    if (key === "height_cm") {
      normalized = normalizeNumber(rawValue, 80, 260)
    } else if (key === "weight_kg") {
      normalized = normalizeNumber(rawValue, 20, 400)
    } else if (key === "meals_per_day") {
      normalized = normalizeInteger(rawValue, 1, 8)
    } else if (key === "intermittent_fasting") {
      normalized = normalizeBoolean(rawValue)
    } else {
      normalized = normalizeText(rawValue)
    }

    if (normalized === undefined) {
      throw new Error(`Valor no valido para ${key}.`)
    }

    patch[key] = normalized
  }

  if (!Object.keys(patch).length) {
    throw new Error("No hay cambios de memoria validos para guardar.")
  }

  return patch
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const gymId = String(body?.gymId ?? "")
    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }
    const updates = validatePatch(
      body?.updates && typeof body.updates === "object" && !Array.isArray(body.updates)
        ? body.updates
        : {}
    )

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const authResult = await client.auth.getCurrentUser()
    if (authResult.error || !authResult.data?.user?.id) {
      return json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401)
    }

    const portalAccountResult = await client.database
      .from("client_portal_accounts")
      .select("*")
      .eq("auth_user_id", authResult.data.user.id)
      .eq("gym_id", gymId)
      .maybeSingle()

    if (portalAccountResult.error || !portalAccountResult.data) {
      return json({ code: "PORTAL_ACCOUNT_REQUIRED", message: "No hay acceso al portal asociado a este usuario." }, 403)
    }

    const ensureResult = await client.database.rpc("app_ensure_client_nutrition_thread", {
      p_auth_user_id: authResult.data.user.id,
      p_gym_id: gymId,
    })

    if (ensureResult.error || !ensureResult.data?.nutrition_profile_id) {
      return json({ code: "NUTRITION_PROFILE_REQUIRED", message: ensureResult.error?.message ?? "No se pudo preparar el perfil nutricional." }, 400)
    }

    const updateResult = await client.database
      .from("client_nutrition_profiles")
      .update({
        ...updates,
        onboarding_status: "active",
        updated_at: new Date().toISOString()
      })
      .eq("id", ensureResult.data.nutrition_profile_id)
      .eq("gym_id", gymId)
      .select("*")
      .maybeSingle()

    if (updateResult.error || !updateResult.data) {
      return json({ code: "MEMORY_UPDATE_FAILED", message: updateResult.error?.message ?? "No se pudo actualizar la memoria nutricional." }, 400)
    }

    const auditInsert = await client.database.from("audit_logs").insert([
      {
        gym_id: gymId,
        actor_profile_id: null,
        entity_name: "client_nutrition_profiles",
        entity_id: updateResult.data.id,
        action: "nutrition_memory_update",
        diff: {
          source: "client_portal",
          updates
        }
      }
    ])

    if (auditInsert.error) {
      return json({ code: "AUDIT_LOG_FAILED", message: auditInsert.error.message ?? "No se pudo registrar la auditoria de memoria." }, 400)
    }

    return json({
      ok: true,
      profile: updateResult.data
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
