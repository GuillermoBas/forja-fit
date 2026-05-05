"use server"

import { getCurrentPortalAccessToken } from "@/lib/auth/portal-session"
import { isClientPreview } from "@/lib/preview-mode"
import { withGymContext } from "@/lib/tenant"

type ActionResult<T = unknown> = {
  ok: boolean
  data?: T
  error?: string
}

async function invokePortalPushFunction<T>(
  slug: string,
  body: Record<string, unknown>
): Promise<ActionResult<T>> {
  if (await isClientPreview()) {
    return { ok: true, data: { preview: true } as T }
  }

  const accessToken = await getCurrentPortalAccessToken()
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL

  if (!accessToken) {
    return { ok: false, error: "No se ha podido recuperar la sesion del portal." }
  }

  if (!baseUrl) {
    return { ok: false, error: "Falta NEXT_PUBLIC_INSFORGE_URL." }
  }

  const response = await fetch(`${baseUrl}/functions/${slug}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(await withGymContext(body))
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.message ?? "No se pudo completar la operacion push."
    }
  }

  return { ok: true, data: payload as T }
}

export async function savePortalPushSubscriptionAction(subscription: PushSubscriptionJSON) {
  return invokePortalPushFunction("save_push_subscription", {
    endpoint: subscription.endpoint,
    keys: subscription.keys
  })
}

export async function removePortalPushSubscriptionAction(endpoint: string) {
  return invokePortalPushFunction("remove_push_subscription", { endpoint })
}

export async function updatePortalPushPreferencesAction(preferences: {
  passExpiryEnabled?: boolean
  passAssignedEnabled?: boolean
  sessionRemindersEnabled?: boolean
}) {
  return invokePortalPushFunction("update_push_preferences", preferences)
}
