import { NextResponse } from "next/server"
import { completeStaffAuthentication } from "@/features/auth/server"
import { clearAuthOauthVerifierCookie, getAuthCookies } from "@/lib/auth/cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { buildAbsoluteAppUrl, resolvePublicOriginFromRequest } from "@/lib/public-origin"

export async function GET(request: Request) {
  const publicOrigin = resolvePublicOriginFromRequest(request)
  const url = new URL(request.url)
  const code = url.searchParams.get("insforge_code")
  const explicitError = url.searchParams.get("insforge_error")

  if (explicitError) {
    const message = encodeURIComponent(explicitError)
    return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
  }

  if (!code) {
    const message = encodeURIComponent("No se recibio el codigo de acceso de Google.")
    return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
  }

  const { oauthVerifier } = await getAuthCookies()

  if (!oauthVerifier) {
    const message = encodeURIComponent("La sesion OAuth ha caducado. Vuelve a intentarlo con Google.")
    return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.exchangeOAuthCode(code, oauthVerifier)
    await clearAuthOauthVerifierCookie()

    if (result.error || !result.data?.accessToken) {
      const message = encodeURIComponent(result.error?.message ?? "No se pudo completar el acceso con Google.")
      return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
    }

    const completion = await completeStaffAuthentication({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken ?? null
    })

    const message = encodeURIComponent(completion.error ?? "No se pudo activar el acceso staff.")
    return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
  } catch (error) {
    await clearAuthOauthVerifierCookie()

    const message = encodeURIComponent(
      error instanceof Error ? error.message : "No se pudo completar el acceso con Google."
    )
    return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
  }
}
