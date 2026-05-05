import { redirect } from "next/navigation"
import {
  getPortalAuthCookies,
  setPortalAuthCookies
} from "@/lib/auth/portal-cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { requireCurrentGym } from "@/lib/tenant"

export type PortalActionState = {
  error?: string
  success?: string
  email?: string
  verificationRequired?: boolean
  resetCodeSent?: boolean
  resetToken?: string
}

type FinalizeAuthParams = {
  accessToken: string
  refreshToken?: string | null
  provider: "password" | "google"
}

type FunctionError = {
  code: string
  message: string
}

async function invokePortalFunction<TData>(
  slug: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<{ data?: TData; error?: FunctionError }> {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL

  if (!baseUrl) {
    return {
      error: {
        code: "INSFORGE_CONFIG_MISSING",
        message: "Falta NEXT_PUBLIC_INSFORGE_URL para completar el acceso al portal."
      }
    }
  }

  const response = await fetch(`${baseUrl}/functions/${slug}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  })

  const payload = (await response.json().catch(() => null)) as
    | (TData & { message?: string; code?: string })
    | null

  if (!response.ok) {
    return {
      error: {
        code: payload?.code ?? "FUNCTION_ERROR",
        message: payload?.message ?? "No se pudo completar la operacion del portal."
      }
    }
  }

  return { data: payload as TData }
}

export async function completePortalAuthentication({
  accessToken,
  refreshToken,
  provider
}: FinalizeAuthParams): Promise<PortalActionState> {
  const gym = await requireCurrentGym()

  await setPortalAuthCookies(accessToken, refreshToken ?? null)

  const claimResult = await invokePortalFunction<{ ok: boolean }>(
    "claim_client_portal_account",
    accessToken,
    { provider, gymId: gym.id, gymSlug: gym.slug }
  )

  if (claimResult.error) {
    return { error: claimResult.error.message }
  }

  const loginResult = await invokePortalFunction<{ ok: boolean }>(
    "record_client_portal_login",
    accessToken,
    { provider, gymId: gym.id, gymSlug: gym.slug }
  )

  if (loginResult.error) {
    return { error: loginResult.error.message }
  }

  redirect("/cliente/dashboard")
}

export async function getPortalResetState() {
  const { accessToken } = await getPortalAuthCookies()

  if (!accessToken) {
    return null
  }

  try {
    const client = createServerInsforgeClient({ accessToken }) as any
    const current = await client.auth.getCurrentUser()
    return current.error ? null : current.data?.user ?? null
  } catch {
    return null
  }
}
