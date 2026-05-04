import { headers } from "next/headers"
import { appConfig } from "@/lib/config"

type HeaderSource = Pick<Headers, "get">

function getFirstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null
}

function getFallbackOrigin() {
  try {
    return new URL(appConfig.appUrl).origin
  } catch {
    return "http://localhost:3000"
  }
}

export function resolvePublicOriginFromHeaders(headerSource: HeaderSource) {
  const forwardedHost = getFirstHeaderValue(headerSource.get("x-forwarded-host"))
  const host = forwardedHost || getFirstHeaderValue(headerSource.get("host"))

  if (!host) {
    return getFallbackOrigin()
  }

  const forwardedProto = getFirstHeaderValue(headerSource.get("x-forwarded-proto"))
  const protocol = forwardedProto || (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https")

  return `${protocol}://${host}`
}

export function resolvePublicOriginFromRequest(request: Request) {
  return resolvePublicOriginFromHeaders(request.headers)
}

export async function resolvePublicOrigin() {
  return resolvePublicOriginFromHeaders(await headers())
}

export function buildAbsoluteAppUrl(path: string, origin: string) {
  return new URL(path, origin)
}
