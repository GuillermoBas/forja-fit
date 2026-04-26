"use server"

import { redirect } from "next/navigation"
import { clearAuthCookies, setAuthCookies } from "@/lib/auth/cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"

export type AuthActionState = {
  error?: string
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Introduce email y contrasena." }
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.signInWithPassword({ email, password })

    if (result.error || !result.data?.accessToken) {
      return { error: result.error?.message ?? "No se pudo iniciar sesion." }
    }

    await setAuthCookies(result.data.accessToken, result.data.refreshToken ?? null)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo iniciar sesion."
    }
  }

  redirect("/dashboard")
}

export async function signOutAction() {
  await clearAuthCookies()
  redirect("/login")
}

export async function bootstrapFirstAdminAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const fullName = String(formData.get("fullName") ?? "").trim()

  if (!email || !password || !fullName) {
    return { error: "Completa nombre, email y contrasena." }
  }

  try {
    const client = createServerInsforgeClient() as any
    const existingAdmins = await client.database
      .from("profiles")
      .select("id", { count: "exact" })
      .eq("role", "admin")

    if ((existingAdmins.count ?? 0) > 0) {
      return { error: "Ya existe un admin. El bootstrap inicial esta cerrado." }
    }

    const signUp = await client.auth.signUp({
      email,
      password,
      name: fullName,
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`
    })

    if (signUp.error || !signUp.data?.user?.id) {
      return { error: signUp.error?.message ?? "No se pudo crear el usuario admin." }
    }

    const profileInsert = await client.database.from("profiles").insert([
      {
        auth_user_id: signUp.data.user.id,
        full_name: fullName,
        email,
        role: "admin",
        is_active: true
      }
    ])

    if (profileInsert.error) {
      return { error: profileInsert.error.message ?? "No se pudo crear el perfil admin." }
    }

    if (signUp.data.accessToken) {
      await setAuthCookies(signUp.data.accessToken, signUp.data.refreshToken ?? null)
      redirect("/dashboard")
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo crear el admin inicial."
    }
  }

  redirect("/login?insforge_status=success")
}
