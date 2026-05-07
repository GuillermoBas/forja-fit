// @ts-nocheck
import bcrypt from "npm:bcryptjs"
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
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede activar manualmente el portal cliente" }, 403) }
  }

  return { profile: profileResult.data }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json().catch(() => ({}))
    const gymId = String(body?.gymId ?? "").trim()
    const clientId = String(body?.clientId ?? "").trim()
    const password = String(body?.password ?? "")

    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    if (!clientId) {
      return json({ code: "INVALID_INPUT", message: "Selecciona un cliente" }, 400)
    }

    if (password.length < 8) {
      return json({ code: "INVALID_INPUT", message: "La contrasena debe tener al menos 8 caracteres" }, 400)
    }

    if (password.length > 128) {
      return json({ code: "INVALID_INPUT", message: "La contrasena es demasiado larga" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client, gymId)
    if (actor.error) {
      return actor.error
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const rpcResult = await client.database.rpc("app_manually_activate_client_portal_account", {
      p_actor_profile_id: actor.profile.id,
      p_gym_id: gymId,
      p_client_id: clientId,
      p_password_hash: passwordHash
    })

    if (rpcResult.error || !rpcResult.data) {
      return json(
        {
          code: "ACTIVATION_FAILED",
          message: rpcResult.error?.message ?? "No se pudo activar el acceso manual del cliente"
        },
        400
      )
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
