import { NextResponse, type NextRequest } from "next/server"
import {
  accessCookieMaxAge,
  accessCookieName,
  portalAccessCookieMaxAge,
  portalAccessCookieName,
  portalRefreshCookieMaxAge,
  portalRefreshCookieName,
  refreshCookieMaxAge,
  refreshCookieName
} from "@/lib/auth/cookie-config"

const refreshThresholdSeconds = 60 * 5

type SessionCookieNames = {
  access: string
  refresh: string
  accessMaxAge: number
  refreshMaxAge: number
}

type SessionRefreshResult =
  | {
      kind: "unchanged"
    }
  | {
      kind: "refreshed"
      names: SessionCookieNames
      accessToken: string
      refreshToken: string
    }
  | {
      kind: "clear"
      names: SessionCookieNames
    }

function getJwtSecondsUntilExpiry(token: string | undefined) {
  if (!token) {
    return 0
  }

  try {
    const [, payload] = token.split(".")
    if (!payload) {
      return 0
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const json = JSON.parse(atob(normalized)) as { exp?: number }

    if (!json.exp) {
      return 0
    }

    return json.exp - Math.floor(Date.now() / 1000)
  } catch {
    return 0
  }
}

function shouldRefreshAccessToken(accessToken: string | undefined) {
  return getJwtSecondsUntilExpiry(accessToken) <= refreshThresholdSeconds
}

async function refreshSessionCookies(
  request: NextRequest,
  names: SessionCookieNames
): Promise<SessionRefreshResult> {
  const accessToken = request.cookies.get(names.access)?.value
  const refreshToken = request.cookies.get(names.refresh)?.value

  if (!refreshToken || !shouldRefreshAccessToken(accessToken)) {
    return { kind: "unchanged" }
  }

  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
  if (!baseUrl) {
    return { kind: "unchanged" }
  }

  try {
    const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh?client_type=mobile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store"
    })

    const payload = (await refreshResponse.json().catch(() => null)) as
      | {
          accessToken?: string
          refreshToken?: string
        }
      | null

    if (!refreshResponse.ok || !payload?.accessToken) {
      return { kind: "clear", names }
    }

    return {
      kind: "refreshed",
      names,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken ?? refreshToken
    }
  } catch {
    // Keep the current cookies so transient network errors do not log the user out.
    return { kind: "unchanged" }
  }
}

function applyRequestCookie(cookieHeader: string, name: string, value: string | null) {
  const cookies = new Map(
    cookieHeader
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [cookieName, ...rest] = item.split("=")
        return [cookieName, rest.join("=")] as const
      })
  )

  if (value === null) {
    cookies.delete(name)
  } else {
    cookies.set(name, value)
  }

  return Array.from(cookies.entries())
    .map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`)
    .join("; ")
}

function writeResponseCookies(response: NextResponse, result: SessionRefreshResult) {
  if (result.kind === "unchanged") {
    return
  }

  if (result.kind === "clear") {
    response.cookies.delete(result.names.access)
    response.cookies.delete(result.names.refresh)
    return
  }

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/"
  }

  response.cookies.set(result.names.access, result.accessToken, {
    ...cookieOptions,
    maxAge: result.names.accessMaxAge
  })

  response.cookies.set(result.names.refresh, result.refreshToken, {
    ...cookieOptions,
    maxAge: result.names.refreshMaxAge
  })
}

export async function proxy(request: NextRequest) {
  const results = await Promise.all([
    refreshSessionCookies(request, {
      access: accessCookieName,
      refresh: refreshCookieName,
      accessMaxAge: accessCookieMaxAge,
      refreshMaxAge: refreshCookieMaxAge
    }),
    refreshSessionCookies(request, {
      access: portalAccessCookieName,
      refresh: portalRefreshCookieName,
      accessMaxAge: portalAccessCookieMaxAge,
      refreshMaxAge: portalRefreshCookieMaxAge
    })
  ])

  const requestHeaders = new Headers(request.headers)
  let cookieHeader = requestHeaders.get("cookie") ?? ""

  for (const result of results) {
    if (result.kind === "refreshed") {
      cookieHeader = applyRequestCookie(cookieHeader, result.names.access, result.accessToken)
      cookieHeader = applyRequestCookie(cookieHeader, result.names.refresh, result.refreshToken)
    }

    if (result.kind === "clear") {
      cookieHeader = applyRequestCookie(cookieHeader, result.names.access, null)
      cookieHeader = applyRequestCookie(cookieHeader, result.names.refresh, null)
    }
  }

  if (cookieHeader) {
    requestHeaders.set("cookie", cookieHeader)
  } else {
    requestHeaders.delete("cookie")
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  })

  for (const result of results) {
    writeResponseCookies(response, result)
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml)).*)"
  ]
}
