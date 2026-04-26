// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function mapRpcError(message: string) {
  if (message.includes("No existe ninguna ficha de cliente")) {
    return { code: "PORTAL_NO_CLIENT_MATCH", message }
  }

  if (message.includes("Hay varias fichas de cliente")) {
    return { code: "PORTAL_DUPLICATE_CLIENT_EMAIL", message }
  }

  if (message.includes("ya esta reclamado por otra cuenta")) {
    return { code: "PORTAL_ALREADY_CLAIMED", message }
  }

  if (message.includes("desactivado")) {
    return { code: "PORTAL_DISABLED", message }
  }

  if (message.includes("ya esta enlazada a otro cliente")) {
    return { code: "PORTAL_AUTH_USER_ALREADY_LINKED", message }
  }

  return { code: "PORTAL_CLAIM_FAILED", message }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const provider = body?.provider

    if (!provider) {
      return json({ code: "INVALID_INPUT", message: "El proveedor es obligatorio" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const authResult = await client.auth.getCurrentUser()
    if (authResult.error || !authResult.data?.user?.id || !authResult.data.user.email) {
      return json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401)
    }

    const rpcResult = await client.database.rpc("app_claim_client_portal_account", {
      p_auth_user_id: authResult.data.user.id,
      p_email: authResult.data.user.email,
      p_provider: provider
    })

    if (rpcResult.error) {
      const mapped = mapRpcError(rpcResult.error.message ?? "No se pudo reclamar el acceso")
      const status = mapped.code === "PORTAL_CLAIM_FAILED" ? 400 : 409
      return json(mapped, status)
    }

    return json({
      ok: true,
      portalAccount: rpcResult.data
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
