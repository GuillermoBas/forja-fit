import { NextResponse } from "next/server"
import { getStaffOauthRedirectUrl } from "@/features/auth/server"
import { setAuthOauthVerifierCookie } from "@/lib/auth/cookies"
import { createServerInsforgeClient } from "@/lib/insforge/server"

export async function GET(request: Request) {
  try {
    const client = createServerInsforgeClient() as any
    const result = await client.auth.signInWithOAuth({
      provider: "google",
      redirectTo: getStaffOauthRedirectUrl(),
      skipBrowserRedirect: true
    })

    if (result.error || !result.data?.url || !result.data?.codeVerifier) {
      const message = encodeURIComponent(result.error?.message ?? "No se pudo iniciar el acceso con Google.")
      return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
    }

    await setAuthOauthVerifierCookie(result.data.codeVerifier)
    return NextResponse.redirect(result.data.url)
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "No se pudo iniciar el acceso con Google."
    )
    return NextResponse.redirect(new URL(`/login?error=${message}`, request.url))
  }
}
