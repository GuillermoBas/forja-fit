// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"
const dayKeys = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function isObject(value: unknown) {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function normalizeMeal(value: unknown) {
  if (!isObject(value)) {
    return null
  }

  const title = typeof value.title === "string" ? value.title.trim().slice(0, 120) : ""
  const detail = typeof value.detail === "string" ? value.detail.trim().slice(0, 500) : ""

  if (!title || !detail) {
    return null
  }

  return { title, detail }
}

function normalizePlan(plan: unknown) {
  if (!isObject(plan)) {
    throw new Error("El plan semanal debe ser un objeto JSON.")
  }

  const weekGoal = typeof plan.week_goal === "string" ? plan.week_goal.trim().slice(0, 400) : ""
  const notes = typeof plan.notes === "string" ? plan.notes.trim().slice(0, 600) : ""
  const shoppingList = Array.isArray(plan.shopping_list)
    ? plan.shopping_list
        .map((item) => (typeof item === "string" ? item.trim().slice(0, 120) : ""))
        .filter(Boolean)
        .slice(0, 30)
    : []
  const daysInput = isObject(plan.days) ? plan.days : null

  if (!weekGoal || !daysInput) {
    throw new Error("El plan semanal necesita objetivo y dias estructurados.")
  }

  const days = {}

  for (const dayKey of dayKeys) {
    const dayValue = daysInput[dayKey]
    if (!isObject(dayValue)) {
      throw new Error(`Falta la estructura del dia ${dayKey}.`)
    }

    const meals = Array.isArray(dayValue.meals)
      ? dayValue.meals.map(normalizeMeal).filter(Boolean).slice(0, 6)
      : []

    if (!meals.length) {
      throw new Error(`El dia ${dayKey} necesita al menos una comida.`)
    }

    days[dayKey] = {
      focus: typeof dayValue.focus === "string" ? dayValue.focus.trim().slice(0, 200) : "",
      meals
    }
  }

  return {
    week_goal: weekGoal,
    notes,
    shopping_list: shoppingList,
    days
  }
}

function normalizeWeekStartsOn(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("La fecha de inicio del plan no es valida.")
  }

  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("La fecha de inicio del plan no es valida.")
  }

  return trimmed
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : ""
    const weekStartsOn = normalizeWeekStartsOn(body?.weekStartsOn)
    const generatedByModel = typeof body?.generatedByModel === "string"
      ? body.generatedByModel.trim().slice(0, 120)
      : null
    const planJson = normalizePlan(body?.plan)

    if (!title) {
      return json({ code: "INVALID_TITLE", message: "El plan semanal necesita un titulo." }, 400)
    }

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
      .maybeSingle()

    if (portalAccountResult.error || !portalAccountResult.data) {
      return json({ code: "PORTAL_ACCOUNT_REQUIRED", message: "No hay acceso al portal asociado a este usuario." }, 403)
    }

    const ensureResult = await client.database.rpc("app_ensure_client_nutrition_thread", {
      p_auth_user_id: authResult.data.user.id
    })

    if (ensureResult.error || !ensureResult.data?.nutrition_profile_id) {
      return json({ code: "NUTRITION_PROFILE_REQUIRED", message: ensureResult.error?.message ?? "No se pudo preparar el perfil nutricional." }, 400)
    }

    const saveResult = await client.database
      .from("weekly_nutrition_plans")
      .upsert([{
        client_id: portalAccountResult.data.client_id,
        nutrition_profile_id: ensureResult.data.nutrition_profile_id,
        week_starts_on: weekStartsOn,
        title,
        plan_json: planJson,
        generated_by_model: generatedByModel || null,
        updated_at: new Date().toISOString()
      }], {
        onConflict: "client_id,week_starts_on"
      })
      .select("*")
      .maybeSingle()

    if (saveResult.error || !saveResult.data) {
      return json({ code: "PLAN_SAVE_FAILED", message: saveResult.error?.message ?? "No se pudo guardar el menu semanal." }, 400)
    }

    const auditInsert = await client.database.from("audit_logs").insert([{
      actor_profile_id: null,
      entity_name: "weekly_nutrition_plans",
      entity_id: saveResult.data.id,
      action: "nutrition_plan_save",
      diff: {
        source: "client_portal",
        week_starts_on: weekStartsOn,
        generated_by_model: generatedByModel || null
      }
    }])

    if (auditInsert.error) {
      return json({ code: "AUDIT_LOG_FAILED", message: auditInsert.error.message ?? "No se pudo registrar la auditoria del plan." }, 400)
    }

    return json({
      ok: true,
      plan: saveResult.data
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
