import { cookies } from "next/headers"

export const portalAccessCookieName = "insforge_cliente_access_token"
export const portalRefreshCookieName = "insforge_cliente_refresh_token"
export const portalOauthVerifierCookieName = "insforge_cliente_oauth_verifier"

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/"
}

export function getPortalAuthCookieOptions() {
  return baseCookieOptions
}

export async function getPortalAuthCookies() {
  const store = await cookies()

  return {
    accessToken: store.get(portalAccessCookieName)?.value ?? null,
    refreshToken: store.get(portalRefreshCookieName)?.value ?? null,
    oauthVerifier: store.get(portalOauthVerifierCookieName)?.value ?? null
  }
}

export async function setPortalAuthCookies(accessToken: string, refreshToken?: string | null) {
  const store = await cookies()

  store.set(portalAccessCookieName, accessToken, {
    ...baseCookieOptions,
    maxAge: 60 * 15
  })

  if (refreshToken) {
    store.set(portalRefreshCookieName, refreshToken, {
      ...baseCookieOptions,
      maxAge: 60 * 60 * 24 * 7
    })
  }
}

export async function clearPortalAuthCookies() {
  const store = await cookies()
  store.delete(portalAccessCookieName)
  store.delete(portalRefreshCookieName)
}

export async function setPortalOauthVerifierCookie(codeVerifier: string) {
  const store = await cookies()

  store.set(portalOauthVerifierCookieName, codeVerifier, {
    ...baseCookieOptions,
    maxAge: 60 * 10
  })
}

export async function clearPortalOauthVerifierCookie() {
  const store = await cookies()
  store.delete(portalOauthVerifierCookieName)
}
