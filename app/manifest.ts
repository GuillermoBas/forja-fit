import type { MetadataRoute } from "next"
import { getCurrentBranding } from "@/lib/branding"
import { getBrandAssetUrl } from "@/lib/branding-shared"

export const dynamic = "force-dynamic"

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getCurrentBranding()
  const appName = branding.businessName || "Trainium"

  return {
    name: appName,
    short_name: appName,
    description: "La plataforma inteligente para entrenadores personales",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F4F6F8",
    theme_color: "#0D1B2A",
    orientation: "portrait",
    icons: [
      {
        src: getBrandAssetUrl(branding.assets, "icon-192"),
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: getBrandAssetUrl(branding.assets, "icon-512"),
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: getBrandAssetUrl(branding.assets, "maskable-icon-512"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  }
}
