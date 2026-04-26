import { NextResponse } from "next/server"
import { appConfig } from "@/lib/config"
import { setPortalOauthVerifierCookie } from "@/lib/auth/portal-cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"

export async function GET(request: Request) {
  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.signInWithOAuth({
      provider: "google",
      redirectTo: `${appConfig.appUrl}/api/cliente/auth/oauth/callback`,
      skipBrowserRedirect: true
    })

    if (result.error || !result.data?.url || !result.data?.codeVerifier) {
      const message = encodeURIComponent(result.error?.message ?? "No se pudo iniciar el acceso con Google.")
      return NextResponse.redirect(new URL(`/cliente/login?error=${message}`, request.url))
    }

    await setPortalOauthVerifierCookie(result.data.codeVerifier)
    return NextResponse.redirect(result.data.url)
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "No se pudo iniciar el acceso con Google."
    )
    return NextResponse.redirect(new URL(`/cliente/login?error=${message}`, request.url))
  }
}
