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

  return { profile: profileResult.data }
}

async function notifyPassAssigned(client: any, passId: string) {
  if (!passId) {
    return
  }

  try {
    const [passResult, holdersResult] = await Promise.all([
      client.database.from("passes").select("id,pass_type_id,expires_on").eq("id", passId).maybeSingle(),
      client.database.from("pass_holders").select("client_id").eq("pass_id", passId)
    ])

    if (passResult.error || !passResult.data || holdersResult.error || !holdersResult.data) {
      return
    }

    const passTypeResult = await client.database
      .from("pass_types")
      .select("name")
      .eq("id", passResult.data.pass_type_id)
      .maybeSingle()

    const passTypeName = passTypeResult.data?.name ?? "Bono"
    const expiresOn = String(passResult.data.expires_on)
    const [year, month, day] = expiresOn.slice(0, 10).split("-")
    const formattedDate = year && month && day ? `${day}/${month}/${year}` : expiresOn

    for (const holder of holdersResult.data) {
      const clientId = String(holder.client_id)
      await client.functions.invoke("send_push_to_client", {
        body: {
          clientId,
          passId,
          eventType: "pass_assigned",
          dedupeKey: `pass_assigned:${passId}:${clientId}`,
          title: "Nuevo bono asignado",
          body: `Tu ${passTypeName} ya esta activo. Caduca el ${formattedDate}.`,
          url: "/cliente/dashboard"
        }
      })
    }
  } catch {
    // Push complementa al flujo principal: nunca debe revertir la creacion del bono.
  }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    const holderClientIds = Array.isArray(body?.holderClientIds)
      ? body.holderClientIds.filter((value: unknown) => typeof value === "string" && value)
      : [
          typeof body?.holder1ClientId === "string" ? body.holder1ClientId : null,
          typeof body?.holder2ClientId === "string" ? body.holder2ClientId : null
        ].filter(Boolean)

    if (!body?.passTypeId || holderClientIds.length < 1 || !body?.contractedOn || !body?.paymentMethod) {
      return json({ code: "INVALID_INPUT", message: "Faltan datos obligatorios del bono" }, 400)
    }
    if (!["cash", "card", "transfer", "bizum"].includes(String(body.paymentMethod))) {
      return json({ code: "INVALID_INPUT", message: "Metodo de pago no valido" }, 400)
    }
    if (
      body?.priceGross !== undefined &&
      body?.priceGross !== null &&
      body?.priceGross !== "" &&
      (!Number.isInteger(Number(body.priceGross)) || Number(body.priceGross) < 0)
    ) {
      return json({ code: "INVALID_INPUT", message: "El precio del bono debe ser un numero entero en euros" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await client.database.rpc("app_create_pass", {
      p_actor_profile_id: actor.profile.id,
      p_pass_type_id: body.passTypeId,
      p_holder_client_ids: holderClientIds,
      p_purchased_by_client_id: body.purchasedByClientId ?? holderClientIds[0],
      p_payment_method: body.paymentMethod,
      p_price_gross_override:
        body?.priceGross === undefined || body?.priceGross === null || body?.priceGross === ""
          ? null
          : Number(body.priceGross),
      p_contracted_on: body.contractedOn,
      p_notes: body.notes ?? ""
    })

    if (rpcResult.error) {
      return json({ code: "DB_ERROR", message: rpcResult.error.message }, 400)
    }

    const createdPassId = rpcResult.data?.pass_id ?? null
    await notifyPassAssigned(client, createdPassId)

    return json({
      ok: true,
      passId: createdPassId,
      saleId: rpcResult.data?.sale_id ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
