import { NextResponse } from "next/server"
import { setAuthOauthVerifierCookie } from "@/lib/auth/cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { buildAbsoluteAppUrl, resolvePublicOriginFromRequest } from "@/lib/public-origin"

export async function GET(request: Request) {
  const publicOrigin = resolvePublicOriginFromRequest(request)

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.signInWithOAuth({
      provider: "google",
      redirectTo: buildAbsoluteAppUrl("/api/auth/oauth/callback", publicOrigin).toString(),
      skipBrowserRedirect: true
    })

    if (result.error || !result.data?.url || !result.data?.codeVerifier) {
      const message = encodeURIComponent(result.error?.message ?? "No se pudo iniciar el acceso con Google.")
      return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
    }

    await setAuthOauthVerifierCookie(result.data.codeVerifier)
    return NextResponse.redirect(result.data.url)
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "No se pudo iniciar el acceso con Google."
    )
    return NextResponse.redirect(buildAbsoluteAppUrl(`/login?error=${message}`, publicOrigin))
  }
}
