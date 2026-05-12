// @ts-nocheck
const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

function hasAtMostOneDecimal(value: number) {
  return Math.abs(value * 10 - Math.round(value * 10)) < Number.EPSILON
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
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

  if (profile.role !== "admin" && profile.role !== "trainer") {
    return { error: json({ code: "FORBIDDEN", message: "Solo staff puede editar maximos de fuerza" }, 403) }
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
    const entryId = String(body?.entryId ?? "").trim()
    const entryDate = String(body?.entryDate ?? "").trim()
    const valueKg = Number(body?.valueKg)

    if (!gymId) {
      return json({ code: "GYM_REQUIRED", message: "Gimnasio no resuelto" }, 400)
    }

    if (!entryId) {
      return json({ code: "INVALID_INPUT", message: "El registro de fuerza es obligatorio" }, 400)
    }

    if (!entryDate) {
      return json({ code: "INVALID_INPUT", message: "La fecha del registro es obligatoria" }, 400)
    }

    if (!isDateKey(entryDate)) {
      return json({ code: "INVALID_INPUT", message: "La fecha del registro no tiene un formato valido" }, 400)
    }

    if (!Number.isFinite(valueKg) || valueKg < 0) {
      return json({ code: "INVALID_INPUT", message: "El peso debe ser un numero positivo o cero" }, 400)
    }

    if (!hasAtMostOneDecimal(valueKg)) {
      return json({ code: "INVALID_INPUT", message: "El peso solo puede tener un decimal" }, 400)
    }

    const actor = await getActor(token, gymId)
    if (actor.error) {
      return actor.error
    }

    const rpcResult = await insforgeFetch(
      "/api/database/rpc/app_update_client_max_weight_entry",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          p_actor_profile_id: actor.profile.id,
          p_entry_id: entryId,
          p_value_kg: valueKg,
          p_entry_date: entryDate,
          p_notes: body?.notes ?? ""
        })
      }
    )

    if (rpcResult.error) {
      return json(
        { code: "DB_ERROR", message: rpcResult.error || "No se pudo actualizar el maximo de fuerza" },
        400
      )
    }

    return json({
      ok: true,
      entryId: rpcResult.data ?? null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
