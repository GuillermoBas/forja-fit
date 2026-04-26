import { redirect } from "next/navigation"
import { getCurrentProfile, requireAuthenticatedUser } from "@/lib/auth/session"
import { isAdmin, type AppRole } from "@/lib/permissions/roles"

export async function requireRole(role: AppRole) {
  await requireAuthenticatedUser()
  const profile = await getCurrentProfile()

  if (!profile) {
    return null
  }

  if (profile.role !== role) {
    redirect("/dashboard")
  }

  return profile
}

export async function requireAdmin() {
  const profile = await requireRole("admin")

  if (!profile || !isAdmin(profile.role)) {
    redirect("/dashboard")
  }

  return profile
}
