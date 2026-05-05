import type { BrandAssetVariant, BusinessBrandAssets } from "@/types/domain"

export type TenantBranding = {
  businessName: string
  brandAssetVersion: string | null
  assets: BusinessBrandAssets
}

export const BRAND_ASSET_VARIANTS = [
  "source",
  "logo-512-png",
  "logo-512-webp",
  "favicon-16",
  "favicon-32",
  "apple-touch-icon-180",
  "icon-192",
  "icon-512",
  "maskable-icon-512",
  "badge-96"
] as const satisfies readonly BrandAssetVariant[]

export const defaultBrandAssets: BusinessBrandAssets = {
  source: {
    key: "public/trainium-logo-full.png",
    url: "/trainium-logo-full.png",
    contentType: "image/png",
    width: 512,
    height: 512
  },
  "logo-512-png": {
    key: "public/trainium-logo-full.png",
    url: "/trainium-logo-full.png",
    contentType: "image/png",
    width: 512,
    height: 512
  },
  "logo-512-webp": {
    key: "public/trainium-logo-full.png",
    url: "/trainium-logo-full.png",
    contentType: "image/png",
    width: 512,
    height: 512
  },
  "favicon-16": {
    key: "public/trainium-icon.png",
    url: "/trainium-icon.png",
    contentType: "image/png",
    width: 16,
    height: 16
  },
  "favicon-32": {
    key: "public/trainium-icon.png",
    url: "/trainium-icon.png",
    contentType: "image/png",
    width: 32,
    height: 32
  },
  "apple-touch-icon-180": {
    key: "public/icons/apple-touch-icon.png",
    url: "/icons/apple-touch-icon.png",
    contentType: "image/png",
    width: 180,
    height: 180
  },
  "icon-192": {
    key: "public/icons/icon-192.png",
    url: "/icons/icon-192.png",
    contentType: "image/png",
    width: 192,
    height: 192
  },
  "icon-512": {
    key: "public/icons/icon-512.png",
    url: "/icons/icon-512.png",
    contentType: "image/png",
    width: 512,
    height: 512
  },
  "maskable-icon-512": {
    key: "public/icons/maskable-icon-512.png",
    url: "/icons/maskable-icon-512.png",
    contentType: "image/png",
    width: 512,
    height: 512
  },
  "badge-96": {
    key: "public/icons/badge-96.png",
    url: "/icons/badge-96.png",
    contentType: "image/png",
    width: 96,
    height: 96
  }
}

export const defaultTenantBranding: TenantBranding = {
  businessName: "Trainium",
  brandAssetVersion: null,
  assets: defaultBrandAssets
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

export function normalizeBrandAssets(value: unknown): BusinessBrandAssets {
  if (!isObject(value)) {
    return {}
  }

  const assets: BusinessBrandAssets = {}

  for (const variant of BRAND_ASSET_VARIANTS) {
    const asset = value[variant]
    if (!isObject(asset) || typeof asset.url !== "string" || !asset.url.trim()) {
      continue
    }

    assets[variant] = {
      key: typeof asset.key === "string" ? asset.key : "",
      url: asset.url.trim(),
      contentType: typeof asset.contentType === "string" ? asset.contentType : "image/png",
      width: Number(asset.width ?? defaultBrandAssets[variant]?.width ?? 0),
      height: Number(asset.height ?? defaultBrandAssets[variant]?.height ?? 0),
      sizeBytes: Number.isFinite(Number(asset.sizeBytes)) ? Number(asset.sizeBytes) : undefined
    }
  }

  return assets
}

export function mergeBrandAssets(assets: BusinessBrandAssets): BusinessBrandAssets {
  return {
    ...defaultBrandAssets,
    ...assets
  }
}

export function getBrandAssetUrl(
  assets: BusinessBrandAssets,
  variant: BrandAssetVariant,
  fallbackVariant: BrandAssetVariant = "logo-512-png"
) {
  return assets[variant]?.url || assets[fallbackVariant]?.url || defaultBrandAssets[variant]?.url || "/trainium-logo-full.png"
}
