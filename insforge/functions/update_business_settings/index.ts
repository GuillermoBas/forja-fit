// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

async function getActor(client: any, gymId: string) {
  const authResult = await client.auth.getCurrentUser()
  if (authResult.error || !authResult.data?.user) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
  }

  const profileResult = await client.database
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authResult.data.user.id)
    .eq("gym_id", gymId)
    .maybeSingle()

  if (profileResult.error || !profileResult.data) {
    return { error: json({ code: "PROFILE_REQUIRED", message: "Perfil no encontrado" }, 403) }
  }

  if (profileResult.data.role !== "admin") {
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede gestionar la configuracion del negocio" }, 403) }
  }

  return { profile: profileResult.data }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    const gymId = String(body?.gymId ?? "")
    const businessName = String(body?.businessName ?? "").trim()
    const reminderDaysDefault = Number(body?.reminderDaysDefault ?? 7)
    const defaultVatRate = Number(body?.defaultVatRate ?? 21)

    if (!businessName) {
      return json({ code: "INVALID_INPUT", message: "El nombre del negocio es obligatorio" }, 400)
    }

    if (!Number.isInteger(reminderDaysDefault) || reminderDaysDefault < 0 || reminderDaysDefault > 30) {
      return json({ code: "INVALID_INPUT", message: "El aviso por defecto debe estar entre 0 y 30 dias" }, 400)
    }

    if (!Number.isFinite(defaultVatRate) || defaultVatRate < 0) {
      return json({ code: "INVALID_INPUT", message: "El IVA por defecto debe ser valido" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client, gymId)
    if (actor.error) {
      return actor.error
    }

    const currentResult = await client.database.from("settings").select("*").eq("gym_id", gymId).limit(1).maybeSingle()
    if (currentResult.error || !currentResult.data) {
      return json({ code: "DB_ERROR", message: "No se pudo cargar la configuracion del negocio" }, 400)
    }

    const updateResult = await client.database
      .from("settings")
      .update({
        business_name: businessName,
        reminder_days_default: reminderDaysDefault,
        default_vat_rate: defaultVatRate,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentResult.data.id)
      .eq("gym_id", gymId)
      .select("id")
      .single()

    if (updateResult.error || !updateResult.data) {
      return json({ code: "DB_ERROR", message: updateResult.error?.message ?? "No se pudo guardar la configuracion del negocio" }, 400)
    }

    const auditInsert = await client.database.from("audit_logs").insert([
      {
        gym_id: gymId,
        actor_profile_id: actor.profile.id,
        entity_name: "settings",
        entity_id: currentResult.data.id,
        action: "update",
        diff: {
          business_name: businessName,
          reminder_days_default: reminderDaysDefault,
          default_vat_rate: defaultVatRate
        }
      }
    ])

    if (auditInsert.error) {
      return json({ code: "DB_ERROR", message: auditInsert.error.message }, 400)
    }

    return json({
      ok: true,
      settingsId: currentResult.data.id
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
