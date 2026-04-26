import { redirect } from "next/navigation"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { getPortalAuthCookies, setPortalAuthCookies } from "@/lib/auth/portal-cookies"
import type { ClientPortalAccountSummary } from "@/types/domain"

type PortalAuthUser = {
  id: string
  email?: string | null
  name?: string | null
}

function mapPortalAccountRow(row: Record<string, unknown>): ClientPortalAccountSummary {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    authUserId: String(row.auth_user_id),
    email: String(row.email ?? ""),
    status: String(row.status ?? "claimed") as ClientPortalAccountSummary["status"],
    primaryProvider: String(row.primary_provider ?? "password") as ClientPortalAccountSummary["primaryProvider"],
    claimedAt: String(row.claimed_at ?? ""),
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null
  }
}

export async function getCurrentPortalAuthUser(): Promise<PortalAuthUser | null> {
  const { accessToken, refreshToken } = await getPortalAuthCookies()

  if (!accessToken && !refreshToken) {
    return null
  }

  if (accessToken) {
    try {
      const client = createServerInsforgeClient({ accessToken }) as any
      const current = await client.auth.getCurrentUser()

      if (!current.error && current.data?.user) {
        return {
          id: String(current.data.user.id),
          email: current.data.user.email ? String(current.data.user.email) : null,
          name: current.data.user.name ? String(current.data.user.name) : null
        }
      }
    } catch {}
  }

  if (!refreshToken) {
    return null
  }

  try {
    const client = createServerInsforgeClient() as any
    const refreshed = await client.auth.refreshSession({ refreshToken })

    if (refreshed.error || !refreshed.data?.accessToken || !refreshed.data.user) {
      return null
    }

    await setPortalAuthCookies(
      refreshed.data.accessToken,
      refreshed.data.refreshToken ?? refreshToken
    )

    return {
      id: String(refreshed.data.user.id),
      email: refreshed.data.user.email ? String(refreshed.data.user.email) : null,
      name: refreshed.data.user.name ? String(refreshed.data.user.name) : null
    }
  } catch {
    return null
  }
}

export async function getCurrentPortalAccount(): Promise<ClientPortalAccountSummary | null> {
  const { accessToken } = await getPortalAuthCookies()
  const authUser = await getCurrentPortalAuthUser()

  if (!authUser || !accessToken) {
    return null
  }

  try {
    const client = createServerInsforgeClient({ accessToken }) as any
    const result = await client.database
      .from("client_portal_accounts")
      .select("*")
      .eq("auth_user_id", authUser.id)
      .maybeSingle()

    if (result.error || !result.data) {
      return null
    }

    return mapPortalAccountRow(result.data as Record<string, unknown>)
  } catch {
    return null
  }
}

export async function getCurrentPortalAccessToken() {
  const { accessToken } = await getPortalAuthCookies()
  return accessToken
}

export async function requirePortalAccount() {
  const account = await getCurrentPortalAccount()

  if (!account) {
    redirect("/cliente/login")
  }

  return account
}
