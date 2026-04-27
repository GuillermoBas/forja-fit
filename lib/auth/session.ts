import { redirect } from "next/navigation"
import { cache } from "react"
import { getAuthCookies, setAuthCookies } from "@/lib/auth/cookies"
import { demoProfile } from "@/lib/demo-data"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { isStaffPreview } from "@/lib/preview-mode"
import type { Profile } from "@/types/domain"

type AuthUser = {
  id: string
  email?: string | null
  name?: string | null
}

type AuthSession = {
  user: AuthUser
  accessToken: string
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

export const getCurrentAuthSession = cache(async function getCurrentAuthSession(): Promise<AuthSession | null> {
  if (await isStaffPreview()) {
    return {
      accessToken: "visual-preview-staff",
      user: {
        id: "visual-preview-staff",
        email: demoProfile.email,
        name: demoProfile.fullName
      }
    }
  }

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

    if (refreshed.error || !refreshed.data?.accessToken) {
      return null
    }

    try {
      await setAuthCookies(
        refreshed.data.accessToken,
        refreshed.data.refreshToken ?? refreshToken
      )
    } catch {}

    if (refreshed.data.user) {
      return {
        accessToken: refreshed.data.accessToken,
        user: {
          id: String(refreshed.data.user.id),
          email: refreshed.data.user.email ? String(refreshed.data.user.email) : null,
          name: refreshed.data.user.name ? String(refreshed.data.user.name) : null
        }
      }
    }

    const current = await (createServerInsforgeClient({
      accessToken: refreshed.data.accessToken
    }) as any).auth.getCurrentUser()

    if (current.error || !current.data?.user) {
      return null
    }

    return {
      accessToken: refreshed.data.accessToken,
      user: {
        id: String(current.data.user.id),
        email: current.data.user.email ? String(current.data.user.email) : null,
        name: current.data.user.name ? String(current.data.user.name) : null
      }
    }
  } catch {
    return null
  }
})

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  return (await getCurrentAuthSession())?.user ?? null
}

export async function getCurrentAccessToken() {
  return (await getCurrentAuthSession())?.accessToken ?? null
}

async function getProfileForSession(session: AuthSession): Promise<Profile | null> {
  if (await isStaffPreview()) {
    return demoProfile
  }

  try {
    const client = createServerInsforgeClient({ accessToken: session.accessToken }) as any
    const profileResult = await client.database
      .from("profiles")
      .select("*")
      .eq("auth_user_id", session.user.id)
      .maybeSingle()

    if (profileResult.error || !profileResult.data) {
      return null
    }

    return mapProfileRow(profileResult.data as Record<string, unknown>)
  } catch {
    return null
  }
}

export const getCurrentProfile = cache(async function getCurrentProfile(): Promise<Profile | null> {
  const session = await getCurrentAuthSession()

  if (!session) {
    return null
  }

  return getProfileForSession(session)
})

export const getSessionContext = cache(async function getSessionContext() {
  const session = await getCurrentAuthSession()
  const user = session?.user ?? null
  const profile = session ? await getProfileForSession(session) : null

  return { user, profile, accessToken: session?.accessToken ?? null }
})

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
