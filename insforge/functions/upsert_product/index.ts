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
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede gestionar productos" }, 403) }
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
    if (!body?.name || typeof body.name !== "string") {
      return json({ code: "INVALID_INPUT", message: "El nombre es obligatorio" }, 400)
    }
    if (Number(body.priceGross) < 0 || Number.isNaN(Number(body.priceGross))) {
      return json({ code: "INVALID_INPUT", message: "El precio debe ser un numero positivo o cero" }, 400)
    }
    if (Number(body.vatRate) < 0 || Number.isNaN(Number(body.vatRate))) {
      return json({ code: "INVALID_INPUT", message: "El IVA debe ser un numero positivo o cero" }, 400)
    }
    if (Number(body.minStock) < 0 || !Number.isInteger(Number(body.minStock))) {
      return json({ code: "INVALID_INPUT", message: "El stock minimo debe ser un entero positivo o cero" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await client.database.rpc("app_upsert_product", {
      p_actor_profile_id: actor.profile.id,
      p_product_id: body.id ?? null,
      p_name: body.name,
      p_sku: body.sku ?? "",
      p_category: body.category ?? "",
      p_price_gross: body.priceGross,
      p_vat_rate: body.vatRate,
      p_min_stock: body.minStock,
      p_is_active: body.isActive ?? true
    })

    if (rpcResult.error) {
      return json({ code: "DB_ERROR", message: rpcResult.error.message || "No se pudo guardar el producto" }, 400)
    }

    return json({
      ok: true,
      productId: rpcResult.data ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
