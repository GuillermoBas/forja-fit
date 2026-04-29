import { cookies } from "next/headers"
import {
  accessCookieMaxAge,
  accessCookieName,
  authOauthVerifierCookieName,
  refreshCookieMaxAge,
  refreshCookieName
} from "@/lib/auth/cookie-config"

export {
  accessCookieMaxAge,
  accessCookieName,
  authOauthVerifierCookieName,
  refreshCookieMaxAge,
  refreshCookieName
}

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/"
}

export function getAuthCookieOptions() {
  return baseCookieOptions
}

export async function getAuthCookies() {
  const store = await cookies()
  return {
    accessToken: store.get(accessCookieName)?.value ?? null,
    refreshToken: store.get(refreshCookieName)?.value ?? null,
    oauthVerifier: store.get(authOauthVerifierCookieName)?.value ?? null
  }
}

export async function setAuthCookies(accessToken: string, refreshToken?: string | null) {
  const store = await cookies()

  store.set(accessCookieName, accessToken, {
    ...baseCookieOptions,
    maxAge: accessCookieMaxAge
  })

  if (refreshToken) {
    store.set(refreshCookieName, refreshToken, {
      ...baseCookieOptions,
      maxAge: refreshCookieMaxAge
    })
  }
}

export async function clearAuthCookies() {
  const store = await cookies()
  store.delete(accessCookieName)
  store.delete(refreshCookieName)
}

export async function setAuthOauthVerifierCookie(codeVerifier: string) {
  const store = await cookies()

  store.set(authOauthVerifierCookieName, codeVerifier, {
    ...baseCookieOptions,
    maxAge: 60 * 10
  })
}

export async function clearAuthOauthVerifierCookie() {
  const store = await cookies()
  store.delete(authOauthVerifierCookieName)
}
