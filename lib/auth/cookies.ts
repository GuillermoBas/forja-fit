import { cookies } from "next/headers"
import {
  accessCookieMaxAge,
  accessCookieName,
  refreshCookieMaxAge,
  refreshCookieName
} from "@/lib/auth/cookie-config"

export { accessCookieMaxAge, accessCookieName, refreshCookieMaxAge, refreshCookieName }

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
    refreshToken: store.get(refreshCookieName)?.value ?? null
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
