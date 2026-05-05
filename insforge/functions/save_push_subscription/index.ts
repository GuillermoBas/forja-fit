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

export default async function(request: Request) {
  try {
    const token = getToken(request)
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const gymId = String(body?.gymId ?? "")
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : ""
    const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh.trim() : ""
    const auth = typeof body?.keys?.auth === "string" ? body.keys.auth.trim() : ""

    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    if (!endpoint || !p256dh || !auth) {
      return json({ code: "INVALID_INPUT", message: "Suscripcion push incompleta" }, 400)
    }

    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const portal = await requirePortalAccount(client, gymId)
    if (portal.error) {
      return portal.error
    }

    const userAgent = typeof body?.userAgent === "string" ? body.userAgent.slice(0, 500) : null
    const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel.slice(0, 120) : null

    const existing = await client.database
      .from("push_subscriptions")
      .select("id,client_portal_account_id")
      .eq("gym_id", gymId)
      .eq("endpoint", endpoint)
      .maybeSingle()

    const values = {
      gym_id: gymId,
      owner_type: "client",
      client_portal_account_id: portal.account.id,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent,
      device_label: deviceLabel,
      is_active: true,
      last_seen_at: new Date().toISOString(),
      revoked_at: null
    }

    const writeResult = existing.data?.id
      ? await client.database
          .from("push_subscriptions")
          .update(values)
          .eq("id", existing.data.id)
          .eq("gym_id", gymId)
          .eq("client_portal_account_id", portal.account.id)
          .select("id")
          .maybeSingle()
      : await client.database.from("push_subscriptions").insert([values]).select("id").single()

    if (writeResult.error || !writeResult.data) {
      return json(
        {
          code: "SUBSCRIPTION_SAVE_FAILED",
          message: writeResult.error?.message ?? "No se pudo guardar este dispositivo."
        },
        400
      )
    }

    const preferences = await client.database
      .from("push_preferences")
      .select("id")
      .eq("gym_id", gymId)
      .eq("client_portal_account_id", portal.account.id)
      .maybeSingle()

    if (!preferences.data?.id) {
      const preferencesInsert = await client.database.from("push_preferences").insert([
        { gym_id: gymId, client_portal_account_id: portal.account.id }
      ])

      if (preferencesInsert.error) {
        return json(
          {
            code: "PREFERENCES_SAVE_FAILED",
            message: preferencesInsert.error.message ?? "No se pudieron crear las preferencias push."
          },
          400
        )
      }
    }

    return json({ ok: true, subscriptionId: writeResult.data.id })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
