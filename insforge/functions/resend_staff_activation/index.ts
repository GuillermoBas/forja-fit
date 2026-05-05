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
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede reenviar codigos de activacion" }, 403) }
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
    const profileId = String(body?.profileId ?? "").trim()

    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    if (!profileId) {
      return json({ code: "INVALID_INPUT", message: "El usuario staff es obligatorio" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client, gymId)
    if (actor.error) {
      return actor.error
    }

    const profileResult = await client.database
      .from("profiles")
      .select("id,email,full_name,role,is_active")
      .eq("gym_id", gymId)
      .eq("id", profileId)
      .in("role", ["admin", "trainer"])
      .maybeSingle()

    if (profileResult.error || !profileResult.data) {
      return json({ code: "NOT_FOUND", message: "No se encontro el usuario staff." }, 404)
    }

    const email = String(profileResult.data.email ?? "").trim().toLowerCase()
    if (!email) {
      return json({ code: "INVALID_STATE", message: "El usuario staff no tiene email valido." }, 400)
    }

    const verificationResult = await client.database.rpc("app_is_staff_email_verified", {
      p_actor_profile_id: actor.profile.id,
      p_profile_id: profileId
    })

    if (verificationResult.error) {
      return json({ code: "DB_ERROR", message: verificationResult.error.message }, 400)
    }

    if (verificationResult.data === true) {
      return json({ code: "ALREADY_VERIFIED", message: "Este usuario ya tiene el acceso activado." }, 409)
    }

    const anonKey = Deno.env.get("ANON_KEY")
    if (!anonKey) {
      return json({ code: "CONFIG_ERROR", message: "Falta ANON_KEY en el entorno de Functions" }, 500)
    }

    const signupClient = createClient({
      baseUrl: BASE_URL,
      anonKey
    })

    const resendResult = await signupClient.auth.resendVerificationEmail({ email })

    if (resendResult.error) {
      return json(
        {
          code: "AUTH_ERROR",
          message: resendResult.error.message ?? "No se pudo reenviar el codigo de activacion."
        },
        400
      )
    }

    const auditInsert = await client.database.from("audit_logs").insert([
      {
        gym_id: gymId,
        actor_profile_id: actor.profile.id,
        entity_name: "profiles",
        entity_id: profileId,
        action: "send_notification",
        diff: {
          type: "staff_activation_resend",
          email
        }
      }
    ])

    if (auditInsert.error) {
      return json({ code: "DB_ERROR", message: auditInsert.error.message }, 400)
    }

    return json({
      ok: true,
      profileId,
      email,
      resent: true
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
