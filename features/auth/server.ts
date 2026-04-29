import { redirect } from "next/navigation"
import { appConfig } from "@/lib/config"
import { clearAuthCookies, setAuthCookies } from "@/lib/auth/cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"

export type StaffAuthActionState = {
  error?: string
  success?: string
  email?: string
  resetCodeSent?: boolean
  resetToken?: string
}

type FinalizeStaffAuthParams = {
  accessToken: string
  refreshToken?: string | null
}

export async function canBootstrapFirstAdmin() {
  try {
    const client = createServerInsforgeClient() as any
    const result = await client.database
      .from("profiles")
      .select("id", { count: "exact" })
      .eq("role", "admin")

    return (result.count ?? 0) === 0
  } catch {
    return true
  }
}

export async function completeStaffAuthentication({
  accessToken,
  refreshToken
}: FinalizeStaffAuthParams): Promise<StaffAuthActionState> {
  try {
    const client = createServerInsforgeClient({ accessToken }) as any
    const currentUser = await client.auth.getCurrentUser()

    if (currentUser.error || !currentUser.data?.user?.id) {
      await clearAuthCookies()
      return { error: currentUser.error?.message ?? "No se pudo recuperar tu sesion." }
    }

    const profileResult = await client.database
      .from("profiles")
      .select("id,role,is_active")
      .eq("auth_user_id", currentUser.data.user.id)
      .maybeSingle()

    if (profileResult.error || !profileResult.data) {
      await clearAuthCookies()
      return {
        error:
          "Tu usuario existe en Auth, pero no tiene perfil staff en Trainium. Un admin debe darte de alta."
      }
    }

    if (!profileResult.data.is_active) {
      await clearAuthCookies()
      return { error: "Tu perfil staff esta desactivado. Contacta con un administrador." }
    }

    if (profileResult.data.role !== "admin" && profileResult.data.role !== "trainer") {
      await clearAuthCookies()
      return { error: "Tu usuario no tiene permisos para acceder al panel staff." }
    }

    await setAuthCookies(accessToken, refreshToken ?? null)
  } catch (error) {
    await clearAuthCookies()
    return {
      error: error instanceof Error ? error.message : "No se pudo completar el acceso staff."
    }
  }

  redirect("/dashboard")
}

export function getStaffOauthRedirectUrl() {
  return `${appConfig.appUrl}/api/auth/oauth/callback`
}
