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

async function requirePortalAccount(client: any) {
  const authResult = await client.auth.getCurrentUser()
  if (authResult.error || !authResult.data?.user?.id) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
  }

  const accountResult = await client.database
    .from("client_portal_accounts")
    .select("*")
    .eq("auth_user_id", authResult.data.user.id)
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
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : ""

    if (!endpoint) {
      return json({ code: "INVALID_INPUT", message: "Falta endpoint del dispositivo" }, 400)
    }

    const client = createClient({ baseUrl: BASE_URL, edgeFunctionToken: token })
    const portal = await requirePortalAccount(client)
    if (portal.error) {
      return portal.error
    }

    const result = await client.database
      .from("push_subscriptions")
      .update({
        is_active: false,
        revoked_at: new Date().toISOString()
      })
      .eq("endpoint", endpoint)
      .eq("client_portal_account_id", portal.account.id)
      .select("id")

    if (result.error) {
      return json({ code: "SUBSCRIPTION_REMOVE_FAILED", message: result.error.message }, 400)
    }

    return json({ ok: true, removed: (result.data ?? []).length })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
