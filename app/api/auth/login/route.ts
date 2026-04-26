import { NextResponse } from "next/server"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { accessCookieMaxAge, getAuthCookieOptions, refreshCookieMaxAge } from "@/lib/auth/cookies"

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return NextResponse.redirect(new URL("/login?error=Introduce%20email%20y%20contrasena.", request.url))
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.signInWithPassword({ email, password })

    if (result.error || !result.data?.accessToken) {
      const message = encodeURIComponent(result.error?.message ?? "No se pudo iniciar sesion.")
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
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "No se pudo iniciar sesion."
    )
    return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
  }
}
