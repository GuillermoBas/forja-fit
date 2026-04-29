import { NextResponse } from "next/server"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { accessCookieMaxAge, clearAuthCookies, getAuthCookieOptions, refreshCookieMaxAge } from "@/lib/auth/cookies"

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const invalidCredentialsMessage = encodeURIComponent("Email o Contraseña incorrectos.")

  if (!email || !password) {
    return NextResponse.redirect(new URL("/login?error=Introduce%20email%20y%20Contrase%C3%B1a.", request.url))
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.signInWithPassword({ email, password })

    if (result.error || !result.data?.accessToken) {
      const message =
        result.error?.message === "Invalid credentials"
          ? invalidCredentialsMessage
          : encodeURIComponent(result.error?.message ?? "No se pudo iniciar sesión.")
      return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
    }

    const profileResult = await (createServerInsforgeClient({
      accessToken: result.data.accessToken
    }) as any).database
      .from("profiles")
      .select("id,role,is_active")
      .eq("auth_user_id", result.data.user?.id ?? "")
      .maybeSingle()

    if (profileResult.error || !profileResult.data) {
      await clearAuthCookies()
      const message = encodeURIComponent(
        "Tu usuario existe en Auth, pero no tiene perfil staff en Trainium. Un admin debe darte de alta."
      )
      return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
    }

    if (!profileResult.data.is_active) {
      await clearAuthCookies()
      const message = encodeURIComponent("Tu perfil staff está desactivado. Contacta con un administrador.")
      return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
    }

    if (profileResult.data.role !== "admin" && profileResult.data.role !== "trainer") {
      await clearAuthCookies()
      const message = encodeURIComponent("Tu usuario no tiene permisos para acceder al panel staff.")
      return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
    }

    const response = NextResponse.redirect(new URL("/dashboard", request.url))
    const cookieOptions = getAuthCookieOptions()

    response.cookies.set("insforge_access_token", result.data.accessToken, {
      ...cookieOptions,
      maxAge: accessCookieMaxAge
    })

    if (result.data.refreshToken) {
      response.cookies.set("insforge_refresh_token", result.data.refreshToken, {
        ...cookieOptions,
        maxAge: refreshCookieMaxAge
      })
    }

    return response
  } catch (error) {
    const fallbackMessage =
      error instanceof Error && error.message === "Invalid credentials"
        ? "Email o Contraseña incorrectos."
        : error instanceof Error
          ? error.message
          : "No se pudo iniciar sesión."
    const message = encodeURIComponent(fallbackMessage)
    return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
  }
}
