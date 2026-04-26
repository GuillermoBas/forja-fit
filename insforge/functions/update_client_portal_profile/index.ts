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
    const phone = typeof body?.phone === "string" ? body.phone.trim() : ""

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const authResult = await client.auth.getCurrentUser()
    if (authResult.error || !authResult.data?.user?.id) {
      return json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401)
    }

    const portalAccountResult = await client.database
      .from("client_portal_accounts")
      .select("*")
      .eq("auth_user_id", authResult.data.user.id)
      .maybeSingle()

    if (portalAccountResult.error || !portalAccountResult.data) {
      return json(
        {
          code: "PORTAL_ACCOUNT_REQUIRED",
          message: "No hay acceso al portal asociado a este usuario."
        },
        403
      )
    }

    if (portalAccountResult.data.status !== "claimed") {
      return json(
        {
          code: "PORTAL_DISABLED",
          message: "El acceso al portal de este cliente esta desactivado. Contacta con el gimnasio."
        },
        403
      )
    }

    const updateResult = await client.database
      .from("clients")
      .update({
        phone: phone || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", portalAccountResult.data.client_id)
      .select("id,phone")
      .maybeSingle()

    if (updateResult.error || !updateResult.data) {
      return json(
        {
          code: "PROFILE_UPDATE_FAILED",
          message: updateResult.error?.message ?? "No se pudo actualizar el telefono."
        },
        400
      )
    }

    const auditInsert = await client.database.from("audit_logs").insert([
      {
        actor_profile_id: null,
        entity_name: "clients",
        entity_id: portalAccountResult.data.client_id,
        action: "update",
        diff: {
          phone: phone || null,
          source: "client_portal"
        }
      }
    ])

    if (auditInsert.error) {
      return json(
        {
          code: "AUDIT_LOG_FAILED",
          message: auditInsert.error.message ?? "No se pudo registrar la auditoria del cambio."
        },
        400
      )
    }

    return json({
      ok: true,
      clientId: updateResult.data.id,
      phone: updateResult.data.phone
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
