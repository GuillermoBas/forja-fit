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

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    if (!body?.paymentMethod || !Array.isArray(body.items) || body.items.length === 0) {
      return json({ code: "INVALID_INPUT", message: "Faltan datos de la venta" }, 400)
    }
    if (!["cash", "card", "transfer", "bizum"].includes(String(body.paymentMethod))) {
      return json({ code: "INVALID_INPUT", message: "El metodo de pago no es valido" }, 400)
    }
    for (const item of body.items) {
      if (item?.itemType !== "product" || !item?.productId || !Number.isInteger(Number(item?.qty)) || Number(item?.qty) <= 0) {
        return json({ code: "INVALID_INPUT", message: "Cada linea debe tener un producto y una cantidad entera mayor que cero" }, 400)
      }
    }
    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await client.database.rpc("app_create_sale", {
      p_actor_profile_id: actor.profile.id,
      p_client_id: body.clientId ?? null,
      p_payment_method: body.paymentMethod,
      p_fiscal_name: body.fiscalName ?? "",
      p_fiscal_tax_id: body.fiscalTaxId ?? "",
      p_internal_note: body.internalNote ?? "",
      p_items: body.items.map((item) => ({
        item_type: item.itemType,
        product_id: item.productId,
        qty: item.qty
      }))
    })

    if (rpcResult.error) {
      return json({ code: "DB_ERROR", message: rpcResult.error.message || "No se pudo crear la venta" }, 400)
    }

    return json({
      ok: true,
      saleId: rpcResult.data?.sale_id ?? null,
      invoiceCode: rpcResult.data?.invoice_code ?? null,
      totalGross: rpcResult.data?.total_gross ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
