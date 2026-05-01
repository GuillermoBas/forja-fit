// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

async function getActor(client: any) {
  const authResult = await client.auth.getCurrentUser()
  if (authResult.error || !authResult.data?.user) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
  }

  const profileResult = await client.database
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authResult.data.user.id)
    .maybeSingle()

  if (profileResult.error || !profileResult.data) {
    return { error: json({ code: "PROFILE_REQUIRED", message: "Perfil no encontrado" }, 403) }
  }

  if (profileResult.data.role !== "admin") {
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede gestionar staff" }, 403) }
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
    const role = body?.role === "admin" ? "admin" : "trainer"
    const fullName = String(body?.fullName ?? "").trim()
    const email = String(body?.email ?? "").trim().toLowerCase()
    const password = String(body?.password ?? "")
    const profileId = String(body?.profileId ?? "").trim()

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    if (profileId) {
      if (!fullName) {
        return json({ code: "INVALID_INPUT", message: "El nombre completo es obligatorio" }, 400)
      }

      const updateResult = await client.database
        .from("profiles")
        .update({
          full_name: fullName,
          role,
          is_active: body?.isActive !== false,
          updated_at: new Date().toISOString()
        })
        .eq("id", profileId)
        .select("id,email,role,is_active")
        .single()

      if (updateResult.error || !updateResult.data) {
        return json({ code: "DB_ERROR", message: updateResult.error?.message ?? "No se pudo actualizar el staff" }, 400)
      }

      const auditInsert = await client.database.from("audit_logs").insert([
        {
          actor_profile_id: actor.profile.id,
          entity_name: "profiles",
          entity_id: profileId,
          action: "update",
          diff: {
            full_name: fullName,
            role,
            is_active: body?.isActive !== false
          }
        }
      ])

      if (auditInsert.error) {
        return json({ code: "DB_ERROR", message: auditInsert.error.message }, 400)
      }

      return json({
        ok: true,
        profileId,
        mode: "update"
      })
    }

    if (!fullName || !email || password.length < 6) {
      return json(
        { code: "INVALID_INPUT", message: "Nombre, email y una clave temporal de al menos 6 caracteres son obligatorios" },
        400
      )
    }

    const existingProfile = await client.database.from("profiles").select("id").eq("email", email).maybeSingle()
    if (existingProfile.data?.id) {
      return json({ code: "CONFLICT", message: "Ya existe un usuario staff con ese email" }, 409)
    }

    const anonKey = Deno.env.get("ANON_KEY")
    if (!anonKey) {
      return json({ code: "CONFIG_ERROR", message: "Falta ANON_KEY en el entorno de Functions" }, 500)
    }

    const signupClient = createClient({
      baseUrl: BASE_URL,
      anonKey
    })

    const signUpResult = await signupClient.auth.signUp({
      email,
      password,
      name: fullName
    })

    let authUserId = signUpResult.data?.user?.id ?? null

    if (!authUserId) {
      const existingAuthUser = await client.database.rpc("app_find_auth_user_id_by_email", {
        p_actor_profile_id: actor.profile.id,
        p_email: email
      })

      if (existingAuthUser.error || !existingAuthUser.data) {
        return json(
          {
            code: "AUTH_ERROR",
            message:
              signUpResult.error?.message ??
              "No se pudo recuperar el usuario staff creado en Auth"
          },
          400
        )
      }

      authUserId = existingAuthUser.data
    }

    const profileInsert = await client.database.from("profiles").insert([
      {
        auth_user_id: authUserId,
        full_name: fullName,
        email,
        role,
        is_active: body?.isActive !== false
      }
    ]).select("id").single()

    if (profileInsert.error || !profileInsert.data?.id) {
      return json(
        { code: "DB_ERROR", message: profileInsert.error?.message ?? "No se pudo crear el perfil staff" },
        400
      )
    }

    const auditInsert = await client.database.from("audit_logs").insert([
      {
        actor_profile_id: actor.profile.id,
        entity_name: "profiles",
        entity_id: profileInsert.data.id,
        action: "create",
        diff: {
          full_name: fullName,
          email,
          role,
          is_active: body?.isActive !== false
        }
      }
    ])

    if (auditInsert.error) {
      return json({ code: "DB_ERROR", message: auditInsert.error.message }, 400)
    }

    return json({
      ok: true,
      profileId: profileInsert.data.id,
      mode: "create",
      verificationRequired: true
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
