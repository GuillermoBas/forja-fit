import { NextResponse } from "next/server"
import { completeStaffAuthentication } from "@/features/auth/server"
import { clearAuthOauthVerifierCookie, getAuthCookies } from "@/lib/auth/cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("insforge_code")
  const explicitError = url.searchParams.get("insforge_error")

  if (explicitError) {
    const message = encodeURIComponent(explicitError)
    return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
  }

  if (!code) {
    const message = encodeURIComponent("No se recibio el codigo de acceso de Google.")
    return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
  }

  const { oauthVerifier } = await getAuthCookies()

  if (!oauthVerifier) {
    const message = encodeURIComponent("La sesion OAuth ha caducado. Vuelve a intentarlo con Google.")
    return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.exchangeOAuthCode(code, oauthVerifier)
    await clearAuthOauthVerifierCookie()

    if (result.error || !result.data?.accessToken) {
      const message = encodeURIComponent(result.error?.message ?? "No se pudo completar el acceso con Google.")
      return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
    }

    const completion = await completeStaffAuthentication({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken ?? null
    })

    const message = encodeURIComponent(completion.error ?? "No se pudo activar el acceso staff.")
    return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
  } catch (error) {
    await clearAuthOauthVerifierCookie()

    const message = encodeURIComponent(
      error instanceof Error ? error.message : "No se pudo completar el acceso con Google."
    )
    return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
  }
}
