import { cache } from "react"
import { appConfig, isInsforgeConfigured } from "@/lib/config"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { getCurrentGym } from "@/lib/tenant"
import {
  defaultTenantBranding,
  mergeBrandAssets,
  normalizeBrandAssets,
  type TenantBranding
} from "@/lib/branding-shared"

type SettingsBrandingRow = {
  business_name?: unknown
  brand_asset_version?: unknown
  brand_assets?: unknown
}

export const getCurrentBranding = cache(async function getCurrentBranding(): Promise<TenantBranding> {
  const gym = await getCurrentGym()
  const fallback: TenantBranding = {
    ...defaultTenantBranding,
    businessName: gym?.name || appConfig.businessName || defaultTenantBranding.businessName
  }

  if (!gym || !isInsforgeConfigured()) {
    return fallback
  }

  try {
    const client = createServerInsforgeClient() as any
    const result = await client.database
      .from("settings")
      .select("business_name,brand_asset_version,brand_assets")
      .eq("gym_id", gym.id)
      .limit(1)
      .maybeSingle()

    if (result.error || !result.data) {
      return fallback
    }

    const row = result.data as SettingsBrandingRow
    const businessName = String(row.business_name ?? "").trim() || fallback.businessName
    const brandAssetVersion = row.brand_asset_version ? String(row.brand_asset_version) : null

    return {
      businessName,
      brandAssetVersion,
      assets: mergeBrandAssets(normalizeBrandAssets(row.brand_assets))
    }
  } catch {
    return fallback
  }
})
