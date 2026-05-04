"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InstallTrainium } from "@/components/pwa/install-trainium"

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
}

export function InstallPwaCard() {
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    const mediaQueries = [
      window.matchMedia("(display-mode: standalone)"),
      window.matchMedia("(display-mode: fullscreen)"),
      window.matchMedia("(display-mode: window-controls-overlay)")
    ]

    const updateVisibility = () => {
      setShouldRender(!isStandaloneMode())
    }

    updateVisibility()

    const handleAppInstalled = () => {
      setShouldRender(false)
    }

    for (const query of mediaQueries) {
      query.addEventListener("change", updateVisibility)
    }

    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      for (const query of mediaQueries) {
        query.removeEventListener("change", updateVisibility)
      }

      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  if (!shouldRender) {
    return null
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle>Instalacion PWA</CardTitle>
      </CardHeader>
      <CardContent>
        <InstallTrainium respectDismissal={false} compact surface="plain" />
      </CardContent>
    </Card>
  )
}
