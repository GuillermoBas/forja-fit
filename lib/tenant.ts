import { headers } from "next/headers"
import { cache } from "react"
import { isInsforgeConfigured } from "@/lib/config"
import { createServerInsforgeClient } from "@/lib/insforge/server"

export type GymContext = {
  id: string
  slug: string
  name: string
  primaryDomain: string
}

const defaultGymSlug = process.env.TRAINIUM_DEFAULT_GYM_SLUG || "eltemplo"
const rootDomain = process.env.TRAINIUM_ROOT_DOMAIN || "trainium.es"

function normalizeHost(host: string | null) {
  return String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
}

export function resolveGymSlugFromHost(host: string | null) {
  const normalizedHost = normalizeHost(host)

  if (!normalizedHost) {
    return null
  }

  if (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "::1" ||
    normalizedHost.endsWith(".localhost")
  ) {
    const [localSubdomain] = normalizedHost.split(".")
    return localSubdomain && localSubdomain !== "localhost" ? localSubdomain : defaultGymSlug
  }

  if (normalizedHost === rootDomain || normalizedHost === `www.${rootDomain}`) {
    return null
  }

  if (!normalizedHost.endsWith(`.${rootDomain}`)) {
    return null
  }

  const slug = normalizedHost.slice(0, -`.${rootDomain}`.length)
  if (!slug || slug.includes(".") || slug === "www") {
    return null
  }

  return slug
}

export const getRequestedGymSlug = cache(async function getRequestedGymSlug() {
  const headerList = await headers()
  const forwardedHost = headerList.get("x-forwarded-host")?.split(",")[0]?.trim() ?? null
  return resolveGymSlugFromHost(forwardedHost || headerList.get("host"))
})

function mapGymRow(row: Record<string, unknown>): GymContext {
  return {
    id: String(row.id),
    slug: String(row.slug ?? ""),
    name: String(row.name ?? ""),
    primaryDomain: String(row.primary_domain ?? "")
  }
}

export const getCurrentGym = cache(async function getCurrentGym(): Promise<GymContext | null> {
  const slug = await getRequestedGymSlug()

  if (!slug) {
    return null
  }

  if (!isInsforgeConfigured()) {
    return {
      id: "visual-preview-gym",
      slug,
      name: slug === "eltemplo" ? "El Templo" : slug,
      primaryDomain: `${slug}.${rootDomain}`
    }
  }

  const client = createServerInsforgeClient() as any
  const result = await client.database
    .from("gyms")
    .select("id,slug,name,primary_domain,status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle()

  if (result.error || !result.data) {
    return null
  }

  return mapGymRow(result.data as Record<string, unknown>)
})

export async function requireCurrentGym() {
  const gym = await getCurrentGym()

  if (!gym) {
    throw new Error("No se ha podido resolver un gimnasio activo para este dominio.")
  }

  return gym
}

export async function withGymContext<TBody extends Record<string, unknown>>(body: TBody) {
  const gym = await requireCurrentGym()

  return {
    ...body,
    gymId: gym.id,
    gymSlug: gym.slug
  }
}
