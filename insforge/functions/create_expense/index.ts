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

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    const gymId = String(body?.gymId ?? "")
    if (!body?.spentOn || !body?.category || !body?.paymentMethod) {
      return json({ code: "INVALID_INPUT", message: "Faltan datos del gasto" }, 400)
    }
    if (!["cash", "card", "transfer", "bizum"].includes(String(body.paymentMethod))) {
      return json({ code: "INVALID_INPUT", message: "El metodo de pago no es valido" }, 400)
    }
    if (Number(body.baseAmount) < 0 || Number.isNaN(Number(body.baseAmount))) {
      return json({ code: "INVALID_INPUT", message: "La base imponible debe ser positiva o cero" }, 400)
    }
    if (Number(body.vatAmount) < 0 || Number.isNaN(Number(body.vatAmount))) {
      return json({ code: "INVALID_INPUT", message: "El IVA debe ser positivo o cero" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client, gymId)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await client.database.rpc("app_create_expense", {
      p_actor_profile_id: actor.profile.id,
      p_expense_id: body.id ?? null,
      p_spent_on: body.spentOn,
      p_category: body.category,
      p_supplier: body.supplier ?? "",
      p_payment_method: body.paymentMethod,
      p_base_amount: Number(body.baseAmount ?? 0),
      p_vat_amount: Number(body.vatAmount ?? 0),
      p_total_amount: body.totalAmount == null ? null : Number(body.totalAmount),
      p_note: body.note ?? ""
    })

    if (rpcResult.error) {
      return json({ code: "DB_ERROR", message: rpcResult.error.message || "No se pudo guardar el gasto" }, 400)
    }

    return json({
      ok: true,
      expenseId: rpcResult.data ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
