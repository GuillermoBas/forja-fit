// @ts-nocheck
const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

async function insforgeFetch(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      data: null,
      error: data?.message || data?.error || response.statusText
    }
  }

  return { data, error: null }
}

async function getActor(token: string, gymId: string) {
  const authResult = await insforgeFetch("/api/auth/sessions/current", token)
  if (authResult.error || !authResult.data?.user) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
  }

  const params = new URLSearchParams({
    select: "*",
    auth_user_id: `eq.${authResult.data.user.id}`,
    gym_id: `eq.${gymId}`,
    limit: "1"
  })
  const profileResult = await insforgeFetch(`/api/database/records/profiles?${params}`, token)
  const profile = Array.isArray(profileResult.data) ? profileResult.data[0] : null

  if (profileResult.error || !profile) {
    return { error: json({ code: "PROFILE_REQUIRED", message: "Perfil no encontrado" }, 403) }
  }

  if (profile.role !== "admin") {
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede gestionar metricas de fuerza" }, 403) }
  }

  return { profile }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    const gymId = String(body?.gymId ?? "")
    const name = String(body?.name ?? "").trim()
    const unit = String(body?.unit ?? "kg").trim() || "kg"
    const displayOrder = Number(body?.displayOrder ?? 0)

    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    if (!name) {
      return json({ code: "INVALID_INPUT", message: "El nombre de la metrica es obligatorio" }, 400)
    }

    if (!unit) {
      return json({ code: "INVALID_INPUT", message: "La unidad de la metrica es obligatoria" }, 400)
    }

    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      return json({ code: "INVALID_INPUT", message: "El orden debe ser un numero entero positivo o cero" }, 400)
    }

    const actor = await getActor(token, gymId)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await insforgeFetch(
      "/api/database/rpc/app_upsert_strength_metric",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          p_actor_profile_id: actor.profile.id,
          p_metric_id: body?.id ?? null,
          p_name: name,
          p_unit: unit,
          p_is_active: body?.isActive ?? true,
          p_display_order: displayOrder
        })
      }
    )

    if (rpcResult.error) {
      return json(
        { code: "DB_ERROR", message: rpcResult.error || "No se pudo guardar la metrica de fuerza" },
        400
      )
    }

    return json({
      ok: true,
      metricId: rpcResult.data ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
