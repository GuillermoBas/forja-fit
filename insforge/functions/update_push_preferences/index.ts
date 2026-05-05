// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function getToken(request: Request) {
  return request.headers.get("Authorization")?.replace("Bearer ", "") ?? ""
}

async function requirePortalAccount(client: any, gymId: string) {
  const authResult = await client.auth.getCurrentUser()
  if (authResult.error || !authResult.data?.user?.id) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
  }

  const accountResult = await client.database
    .from("client_portal_accounts")
    .select("*")
    .eq("auth_user_id", authResult.data.user.id)
    .eq("gym_id", gymId)
    .maybeSingle()

  if (accountResult.error || !accountResult.data) {
    return {
      error: json(
        { code: "PORTAL_ACCOUNT_REQUIRED", message: "No hay acceso al portal asociado a este usuario." },
        403
      )
    }
  }

  if (accountResult.data.status !== "claimed") {
    return {
      error: json(
        {
          code: "PORTAL_DISABLED",
          message: "El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio."
        },
        403
      )
    }
  }

  return { account: accountResult.data }
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined
}

export default async function(request: Request) {
  try {
    const token = getToken(request)
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const gymId = String(body?.gymId ?? "")
    const updates: Record<string, boolean> = {}

    const passExpiry = optionalBoolean(body?.passExpiryEnabled)
    const passAssigned = optionalBoolean(body?.passAssignedEnabled)
    const sessionReminders = optionalBoolean(body?.sessionRemindersEnabled)

    if (passExpiry !== undefined) updates.pass_expiry_enabled = passExpiry
    if (passAssigned !== undefined) updates.pass_assigned_enabled = passAssigned
    if (sessionReminders !== undefined) updates.session_reminders_enabled = sessionReminders

    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    if (!Object.keys(updates).length) {
      return json({ code: "INVALID_INPUT", message: "No hay preferencias validas para actualizar" }, 400)
    }

    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const portal = await requirePortalAccount(client, gymId)
    if (portal.error) {
      return portal.error
    }

    const existing = await client.database
      .from("push_preferences")
      .select("id")
      .eq("gym_id", gymId)
      .eq("client_portal_account_id", portal.account.id)
      .maybeSingle()

    const result = existing.data?.id
      ? await client.database
          .from("push_preferences")
          .update(updates)
          .eq("gym_id", gymId)
          .eq("client_portal_account_id", portal.account.id)
          .select("*")
          .single()
      : await client.database
          .from("push_preferences")
          .insert([{ gym_id: gymId, client_portal_account_id: portal.account.id, ...updates }])
          .select("*")
          .single()

    if (result.error || !result.data) {
      return json(
        {
          code: "PREFERENCES_UPDATE_FAILED",
          message: result.error?.message ?? "No se pudieron actualizar las preferencias."
        },
        400
      )
    }

    return json({ ok: true, preferences: result.data })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
