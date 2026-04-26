import { redirect } from "next/navigation"
import { getAuthCookies, setAuthCookies } from "@/lib/auth/cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import type { Profile } from "@/types/domain"

type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
}

function mapProfileRow(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: String(row.email ?? ""),
    fullName: String(row.full_name ?? ""),
    role: String(row.role ?? "trainer") as Profile["role"],
    calendarColor: String(row.calendar_color ?? "#BFDBFE")
  }
}

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  const { accessToken, refreshToken } = await getAuthCookies()

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

    if (refreshed.error || !refreshed.data?.accessToken) {
      return null
    }

    await setAuthCookies(
      refreshed.data.accessToken,
      refreshed.data.refreshToken ?? refreshToken
    )

    if (refreshed.data.user) {
      return {
        id: String(refreshed.data.user.id),
        email: refreshed.data.user.email ? String(refreshed.data.user.email) : null,
        name: refreshed.data.user.name ? String(refreshed.data.user.name) : null
      }
    }

    const current = await (createServerInsforgeClient({
      accessToken: refreshed.data.accessToken
    }) as any).auth.getCurrentUser()

    if (current.error || !current.data?.user) {
      return null
    }

    return {
      id: String(current.data.user.id),
      email: current.data.user.email ? String(current.data.user.email) : null,
      name: current.data.user.name ? String(current.data.user.name) : null
    }
  } catch {
    return null
  }
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const authUser = await getCurrentAuthUser()
  const { accessToken } = await getAuthCookies()

  if (!authUser || !accessToken) {
    return null
  }

  try {
    const client = createServerInsforgeClient({ accessToken }) as any
    const profileResult = await client.database
      .from("profiles")
      .select("*")
      .eq("auth_user_id", authUser.id)
      .maybeSingle()

    if (profileResult.error || !profileResult.data) {
      return null
    }

    return mapProfileRow(profileResult.data as Record<string, unknown>)
  } catch {
    return null
  }
}

export async function getSessionContext() {
  const user = await getCurrentAuthUser()
  const profile = await getCurrentProfile()

  return { user, profile }
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentAuthUser()
  if (!user) {
    redirect("/login")
  }
  return user
}

export async function requireAuthenticatedProfile() {
  const { user, profile } = await getSessionContext()
  if (!user) {
    redirect("/login")
  }
  return { user, profile }
}
