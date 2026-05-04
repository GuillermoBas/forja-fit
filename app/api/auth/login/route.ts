import { NextResponse } from "next/server"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import {
  accessCookieMaxAge,
  clearAuthCookies,
  getAuthCookieOptions,
  refreshCookieMaxAge
} from "@/lib/auth/cookies"
import { buildAbsoluteAppUrl, resolvePublicOriginFromRequest } from "@/lib/public-origin"

function looksLikePendingEmailVerification(message?: string) {
  const normalized = String(message ?? "").toLowerCase()

  return (
    normalized.includes("verify") ||
    normalized.includes("verified") ||
    normalized.includes("verification") ||
    normalized.includes("not verified") ||
    normalized.includes("email not") ||
    normalized.includes("confirm")
  )
}

export async function POST(request: Request) {
  const publicOrigin = resolvePublicOriginFromRequest(request)
  const formData = await request.formData()
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const invalidCredentialsMessage = encodeURIComponent("Email o Contrasena incorrectos.")

  if (!email || !password) {
    return NextResponse.redirect(buildAbsoluteAppUrl("/login?error=Introduce%20email%20y%20contrasena.", publicOrigin))
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.signInWithPassword({ email, password })

    if (result.error || !result.data?.accessToken) {
      if (looksLikePendingEmailVerification(result.error?.message)) {
        return NextResponse.redirect(
          buildAbsoluteAppUrl(`/login?activation=required&email=${encodeURIComponent(email)}`, publicOrigin)
        )
      }

      const message =
        result.error?.message === "Invalid credentials"
          ? invalidCredentialsMessage
          : encodeURIComponent(result.error?.message ?? "No se pudo iniciar sesion.")
      return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
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
      return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
    }

    if (!profileResult.data.is_active) {
      await clearAuthCookies()
      const message = encodeURIComponent("Tu perfil staff esta desactivado. Contacta con un administrador.")
      return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
    }

    if (profileResult.data.role !== "admin" && profileResult.data.role !== "trainer") {
      await clearAuthCookies()
      const message = encodeURIComponent("Tu usuario no tiene permisos para acceder al panel staff.")
      return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
    }

    const response = NextResponse.redirect(buildAbsoluteAppUrl("/dashboard", publicOrigin))
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
        ? "Email o Contrasena incorrectos."
        : error instanceof Error
          ? error.message
          : "No se pudo iniciar sesion."

    if (looksLikePendingEmailVerification(fallbackMessage)) {
      return NextResponse.redirect(
        buildAbsoluteAppUrl(`/login?activation=required&email=${encodeURIComponent(email)}`, publicOrigin)
      )
    }

    const message = encodeURIComponent(fallbackMessage)
    return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
  }
}
