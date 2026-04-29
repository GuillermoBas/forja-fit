import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import { Toaster } from "sonner"
import { InstantNavigationProvider } from "@/components/instant-navigation"
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register"
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

export const metadata: Metadata = {
  title: "Trainium",
  description: "La plataforma inteligente para entrenadores personales",
  manifest: "/manifest.webmanifest",
  applicationName: "Trainium",
  appleWebApp: {
    capable: true,
    title: "Trainium",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/trainium-icon.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    shortcut: "/trainium-icon.png",
    apple: "/icons/apple-touch-icon.png"
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "Trainium"
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0D1B2A",
  colorScheme: "light"
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-scroll-behavior="smooth">
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans text-text-primary`}>
        <InstantNavigationProvider>
          <ServiceWorkerRegister />
          {children}
          <Toaster richColors theme="light" position="top-right" />
        </InstantNavigationProvider>
      </body>
    </html>
  )
}
