"use client"

import { useEffect, useState } from "react"
import { Download, Share2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

const dismissalKey = "forjafit:pwa-install-dismissed"

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export function InstallForjaFit({
  className,
  respectDismissal = true,
  compact = false,
  surface = "card"
}: {
  className?: string
  respectDismissal?: boolean
  compact?: boolean
  surface?: "card" | "plain"
}) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(true)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setIsIos(isIosDevice())
    setIsStandalone(isStandaloneMode())
    setDismissed(respectDismissal && window.localStorage.getItem(dismissalKey) === "true")

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setDismissed(false)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
  }, [respectDismissal])

  if (isStandalone || dismissed || (!installPrompt && !isIos && respectDismissal)) {
    return null
  }

  async function install() {
    if (!installPrompt) {
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === "accepted") {
      window.localStorage.setItem(dismissalKey, "true")
      setDismissed(true)
    }
    setInstallPrompt(null)
  }

  function dismiss() {
    window.localStorage.setItem(dismissalKey, "true")
    setDismissed(true)
  }

  const content = (
    <div className={cn(compact ? "space-y-3" : "space-y-4", surface === "plain" ? className : undefined)}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {isIos ? <Share2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-base font-bold text-text-primary">
              Instala ForjaFit
            </p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Abre la plataforma desde un icono propio y usa la experiencia en pantalla completa.
            </p>
          </div>
          {respectDismissal ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 rounded-xl p-0"
              aria-label="Ocultar aviso de instalacion"
              onClick={dismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {installPrompt ? (
          <Button type="button" className="w-full gap-2 rounded-xl sm:w-auto" onClick={install}>
            <Download className="h-4 w-4" />
            Instalar ForjaFit
          </Button>
        ) : null}

        {isIos ? (
          <ol className="grid gap-2 text-sm leading-6 text-text-secondary sm:grid-cols-2 lg:grid-cols-4">
            <li>Abre ForjaFit en Safari.</li>
            <li>Toca Compartir.</li>
            <li>Toca &quot;Anadir a pantalla de inicio&quot;.</li>
            <li>Abre ForjaFit desde el nuevo icono.</li>
          </ol>
        ) : null}

        {!installPrompt && !isIos && !respectDismissal ? (
          <p className="text-sm leading-6 text-text-secondary">
            Si tu navegador lo permite, la opcion de instalar aparecera en la barra de direcciones o en el menu del navegador.
          </p>
        ) : null}
    </div>
  )

  if (surface === "plain") {
    return content
  }

  return (
    <Card className={cn("overflow-hidden rounded-2xl border-primary/18 bg-primary-soft/45 shadow-none", className)}>
      <CardContent className="p-4">
        {content}
      </CardContent>
    </Card>
  )
}
