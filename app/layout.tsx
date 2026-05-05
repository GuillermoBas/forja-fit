import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import { Toaster } from "sonner"
import { TenantBrandingProvider } from "@/components/branding"
import { InstantNavigationProvider } from "@/components/instant-navigation"
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register"
import { getCurrentBranding } from "@/lib/branding"
import { getBrandAssetUrl } from "@/lib/branding-shared"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap"
})

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getCurrentBranding()
  const appName = branding.businessName || "Trainium"

  return {
    title: appName,
    description: "La plataforma inteligente para entrenadores personales",
    manifest: "/manifest.webmanifest",
    applicationName: appName,
    appleWebApp: {
      capable: true,
      title: appName,
      statusBarStyle: "default"
    },
    icons: {
      icon: [
        { url: getBrandAssetUrl(branding.assets, "favicon-32"), sizes: "32x32", type: "image/png" },
        { url: getBrandAssetUrl(branding.assets, "favicon-16"), sizes: "16x16", type: "image/png" },
        { url: getBrandAssetUrl(branding.assets, "icon-192"), sizes: "192x192", type: "image/png" },
        { url: getBrandAssetUrl(branding.assets, "icon-512"), sizes: "512x512", type: "image/png" }
      ],
      shortcut: getBrandAssetUrl(branding.assets, "favicon-32"),
      apple: getBrandAssetUrl(branding.assets, "apple-touch-icon-180")
    },
    other: {
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-title": appName
    }
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0D1B2A",
  colorScheme: "light"
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getCurrentBranding()

  return (
    <html lang="es" data-scroll-behavior="smooth">
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans text-text-primary`}>
        <TenantBrandingProvider branding={branding}>
          <InstantNavigationProvider>
            <ServiceWorkerRegister />
            {children}
            <Toaster richColors theme="light" position="top-right" />
          </InstantNavigationProvider>
        </TenantBrandingProvider>
      </body>
    </html>
  )
}
