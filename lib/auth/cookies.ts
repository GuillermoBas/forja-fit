import { cookies } from "next/headers"

export const accessCookieName = "insforge_access_token"
export const refreshCookieName = "insforge_refresh_token"

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
    maxAge: 60 * 15
  })

  if (refreshToken) {
    store.set(refreshCookieName, refreshToken, {
      ...baseCookieOptions,
      maxAge: 60 * 60 * 24 * 7
    })
  }
}

export async function clearAuthCookies() {
  const store = await cookies()
  store.delete(accessCookieName)
  store.delete(refreshCookieName)
}
