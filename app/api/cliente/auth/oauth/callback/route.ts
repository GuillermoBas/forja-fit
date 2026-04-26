import { NextResponse } from "next/server"
import {
  clearPortalOauthVerifierCookie,
  getPortalAuthCookies
} from "@/lib/auth/portal-cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { completePortalAuthentication } from "@/features/client-portal/auth/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("insforge_code")
  const explicitError = url.searchParams.get("insforge_error")

  if (explicitError) {
    const message = encodeURIComponent(explicitError)
    return NextResponse.redirect(new URL(`/cliente/login?error=${message}`, request.url))
  }

  if (!code) {
    const message = encodeURIComponent("No se recibió el código de acceso de Google.")
    return NextResponse.redirect(new URL(`/cliente/login?error=${message}`, request.url))
  }

  const { oauthVerifier } = await getPortalAuthCookies()

  if (!oauthVerifier) {
    const message = encodeURIComponent("La sesión OAuth ha caducado. Vuelve a intentarlo con Google.")
    return NextResponse.redirect(new URL(`/cliente/login?error=${message}`, request.url))
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.exchangeOAuthCode(code, oauthVerifier)
    await clearPortalOauthVerifierCookie()

    if (result.error || !result.data?.accessToken) {
      const message = encodeURIComponent(result.error?.message ?? "No se pudo completar el acceso con Google.")
      return NextResponse.redirect(new URL(`/cliente/login?error=${message}`, request.url))
    }

    const completion = await completePortalAuthentication({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken ?? null,
      provider: "google"
    })

    const message = encodeURIComponent(completion.error ?? "No se pudo activar el acceso al portal.")
    return NextResponse.redirect(new URL(`/cliente/login?error=${message}`, request.url))
  } catch (error) {
    await clearPortalOauthVerifierCookie()

    const message = encodeURIComponent(
      error instanceof Error ? error.message : "No se pudo completar el acceso con Google."
    )
    return NextResponse.redirect(new URL(`/cliente/login?error=${message}`, request.url))
  }
}
