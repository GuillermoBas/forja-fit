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
  if (message.includes("No hay acceso al portal asociado")) {
    return { code: "PORTAL_NOT_CLAIMED", message }
  }

  if (message.includes("desactivado")) {
    return { code: "PORTAL_DISABLED", message }
  }

  return { code: "PORTAL_LOGIN_FAILED", message }
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
    if (authResult.error || !authResult.data?.user?.id) {
      return json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401)
    }

    const rpcResult = await client.database.rpc("app_record_client_portal_login", {
      p_auth_user_id: authResult.data.user.id,
      p_provider: provider
    })

    if (rpcResult.error) {
      const mapped = mapRpcError(rpcResult.error.message ?? "No se pudo registrar el acceso")
      const status = mapped.code === "PORTAL_LOGIN_FAILED" ? 400 : 409
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
