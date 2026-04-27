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
  title: "ForjaFit",
  description: "La plataforma inteligente para entrenadores personales",
  manifest: "/manifest.webmanifest",
  applicationName: "ForjaFit",
  appleWebApp: {
    capable: true,
    title: "ForjaFit",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/forjafit-icon.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    shortcut: "/forjafit-icon.png",
    apple: "/icons/apple-touch-icon.png"
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "ForjaFit"
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FF6A00",
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
