// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const role = typeof body?.role === "string" ? body.role.trim() : ""
    const content = typeof body?.content === "string" ? body.content : ""
    const modelId = typeof body?.modelId === "string" ? body.modelId.trim() : null
    const metadata =
      body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : {}

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const authResult = await client.auth.getCurrentUser()
    if (authResult.error || !authResult.data?.user?.id) {
      return json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401)
    }

    const rpcResult = await client.database.rpc("app_append_nutrition_message", {
      p_auth_user_id: authResult.data.user.id,
      p_role: role,
      p_content: content,
      p_model_id: modelId,
      p_metadata: metadata
    })

    if (rpcResult.error || !rpcResult.data) {
      return json(
        {
          code: "NUTRITION_MESSAGE_FAILED",
          message: rpcResult.error?.message ?? "No se pudo guardar el mensaje nutricional."
        },
        400
      )
    }

    return json({
      ok: true,
      ...(rpcResult.data as Record<string, unknown>)
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
