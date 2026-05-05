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

  return { profile: profileResult.data }
}

async function notifyPassAssigned(client: any, gymId: string, gymSlug: string, passId: string) {
  if (!passId) {
    return
  }

  try {
    const [passResult, holdersResult] = await Promise.all([
      client.database.from("passes").select("id,pass_type_id,expires_on").eq("gym_id", gymId).eq("id", passId).maybeSingle(),
      client.database.from("pass_holders").select("client_id").eq("gym_id", gymId).eq("pass_id", passId)
    ])

    if (passResult.error || !passResult.data || holdersResult.error || !holdersResult.data) {
      return
    }

    const passTypeResult = await client.database
      .from("pass_types")
      .select("name")
      .eq("gym_id", gymId)
      .eq("id", passResult.data.pass_type_id)
      .maybeSingle()

    const passTypeName = passTypeResult.data?.name ?? "Bono"
    const expiresOn = String(passResult.data.expires_on)

    await client.functions.invoke("send_client_communication", {
      body: {
        gymId,
        gymSlug,
        clientIds: holdersResult.data.map((holder) => String(holder.client_id)),
        passId,
        eventType: "pass_assigned",
        channels: ["email", "push"],
        dedupeSeed: passId,
        templateData: {
          passTypeName,
          expiresOn
        }
      }
    })
  } catch {
    // La comunicacion complementa al flujo principal: nunca debe revertir la renovacion del bono.
  }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    const gymId = String(body?.gymId ?? "")
    const gymSlug = String(body?.gymSlug ?? "eltemplo")
    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }
    if (!body?.passId || !body?.passTypeId || !body?.paymentMethod || !body?.contractedOn) {
      return json({ code: "INVALID_INPUT", message: "Faltan datos de renovacion" }, 400)
    }

    const allowedPaymentMethods = new Set(["cash", "card", "transfer", "bizum"])
    if (!allowedPaymentMethods.has(body.paymentMethod)) {
      return json({ code: "INVALID_INPUT", message: "Metodo de pago no valido" }, 400)
    }

    let priceGrossOverride = null
    if (body.priceGross !== undefined && body.priceGross !== null && body.priceGross !== "") {
      const parsedPrice = Number(body.priceGross)
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedPrice)) {
        return json(
          { code: "INVALID_INPUT", message: "El precio debe ser un numero entero en euros" },
          400
        )
      }

      priceGrossOverride = parsedPrice
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client, gymId)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await client.database.rpc("app_renew_pass", {
      p_actor_profile_id: actor.profile.id,
      p_old_pass_id: body.passId,
      p_pass_type_id: body.passTypeId,
      p_payment_method: body.paymentMethod,
      p_price_gross_override: priceGrossOverride,
      p_contracted_on: body.contractedOn,
      p_notes: body.notes ?? ""
    })

    if (rpcResult.error) {
      return json({ code: "DB_ERROR", message: rpcResult.error.message }, 400)
    }

    const renewedPassId = rpcResult.data?.pass_id ?? null
    await notifyPassAssigned(client, gymId, gymSlug, renewedPassId)

    return json({
      ok: true,
      passId: renewedPassId,
      saleId: rpcResult.data?.sale_id ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
