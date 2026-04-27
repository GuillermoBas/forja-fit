import { redirect } from "next/navigation"
import { cache } from "react"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { getPortalAuthCookies, setPortalAuthCookies } from "@/lib/auth/portal-cookies"
import { getPreviewPortalAccount } from "@/features/client-portal/preview-data"
import { isClientPreview } from "@/lib/preview-mode"
import type { ClientPortalAccountSummary } from "@/types/domain"

type PortalAuthUser = {
  id: string
  email?: string | null
  name?: string | null
}

type PortalAuthSession = {
  user: PortalAuthUser
  accessToken: string
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

export const getCurrentPortalAuthSession = cache(async function getCurrentPortalAuthSession(): Promise<PortalAuthSession | null> {
  if (await isClientPreview()) {
    const account = getPreviewPortalAccount()
    return {
      accessToken: "visual-preview-cliente",
      user: {
        id: account.authUserId,
        email: account.email,
        name: "Guillermo Bas Portal"
      }
    }
  }

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
          accessToken,
          user: {
            id: String(current.data.user.id),
            email: current.data.user.email ? String(current.data.user.email) : null,
            name: current.data.user.name ? String(current.data.user.name) : null
          }
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

    try {
      await setPortalAuthCookies(
        refreshed.data.accessToken,
        refreshed.data.refreshToken ?? refreshToken
      )
    } catch {}

    return {
      accessToken: refreshed.data.accessToken,
      user: {
        id: String(refreshed.data.user.id),
        email: refreshed.data.user.email ? String(refreshed.data.user.email) : null,
        name: refreshed.data.user.name ? String(refreshed.data.user.name) : null
      }
    }
  } catch {
    return null
  }
})

export async function getCurrentPortalAuthUser(): Promise<PortalAuthUser | null> {
  return (await getCurrentPortalAuthSession())?.user ?? null
}

export const getCurrentPortalAccount = cache(async function getCurrentPortalAccount(): Promise<ClientPortalAccountSummary | null> {
  if (await isClientPreview()) {
    return getPreviewPortalAccount()
  }

  const session = await getCurrentPortalAuthSession()

  if (!session) {
    return null
  }

  try {
    const client = createServerInsforgeClient({ accessToken: session.accessToken }) as any
    const result = await client.database
      .from("client_portal_accounts")
      .select("*")
      .eq("auth_user_id", session.user.id)
      .maybeSingle()

    if (result.error || !result.data) {
      return null
    }

    return mapPortalAccountRow(result.data as Record<string, unknown>)
  } catch {
    return null
  }
})

export async function getCurrentPortalAccessToken() {
  return (await getCurrentPortalAuthSession())?.accessToken ?? null
}

export async function requirePortalAccount() {
  const account = await getCurrentPortalAccount()

  if (!account) {
    redirect("/cliente/login")
  }

  return account
}
