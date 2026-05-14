"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Bell, BellOff, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  removePortalPushSubscriptionAction,
  savePortalPushSubscriptionAction,
  updatePortalPushPreferencesAction
} from "@/features/client-portal/push/actions"
import type { PortalPushPreferences } from "@/features/client-portal/push/server"

type Props = {
  vapidPublicKey: string | null
  initialPreferences: PortalPushPreferences
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const output = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index)
  }

  return output
}

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function PreferenceToggle({
  label,
  checked,
  disabled,
  onChange
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-surface-alt/35 px-3 py-3 text-sm font-medium text-text-primary sm:items-center sm:gap-4 sm:px-4">
      <span className="min-w-0 leading-5">{label}</span>
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-primary accent-primary sm:mt-0"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

export function PushNotificationSettings({ vapidPublicKey, initialPreferences }: Props) {
  const [permission, setPermission] = useState<NotificationPermission>("default")
  const [isSupported, setIsSupported] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [preferences, setPreferences] = useState(initialPreferences)
  const [isPending, startTransition] = useTransition()

  const canUsePush = useMemo(
    () => isSupported && Boolean(vapidPublicKey) && (!isIos || isStandalone),
    [isIos, isStandalone, isSupported, vapidPublicKey]
  )

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
    setIsSupported(supported)
    setIsIos(isIosDevice())
    setIsStandalone(isStandaloneDisplay())
    setPermission("Notification" in window ? Notification.permission : "denied")

    if (!supported) {
      return
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setIsRegistered(Boolean(subscription)))
      .catch(() => setIsRegistered(false))
  }, [])

  async function activate() {
    if (!vapidPublicKey) {
      toast.error("Falta la clave publica VAPID para activar notificaciones.")
      return
    }

    if (!canUsePush) {
      toast.error("Instala Trainium en la pantalla de inicio antes de activar notificaciones.")
      return
    }

    const nextPermission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission()

    setPermission(nextPermission)
    if (nextPermission !== "granted") {
      toast.error("El navegador no ha concedido permiso para notificaciones.")
      return
    }

    try {
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(vapidPublicKey)
        }))

      const result = await savePortalPushSubscriptionAction(subscription.toJSON())
      if (!result.ok) {
        throw new Error(result.error)
      }

      setIsRegistered(true)
      toast.success("Notificaciones activadas en este dispositivo.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron activar las notificaciones.")
    }
  }

  async function deactivate() {
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription?.endpoint) {
        const result = await removePortalPushSubscriptionAction(subscription.endpoint)
        if (!result.ok) {
          throw new Error(result.error)
        }
        await subscription.unsubscribe()
      }

      setIsRegistered(false)
      toast.success("Notificaciones desactivadas en este dispositivo.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron desactivar las notificaciones.")
    }
  }

  function updatePreference(key: keyof PortalPushPreferences, value: boolean) {
    const previous = preferences
    const next = { ...preferences, [key]: value }
    setPreferences(next)

    startTransition(async () => {
      const result = await updatePortalPushPreferencesAction({
        passExpiryEnabled: next.passExpiryEnabled,
        passAssignedEnabled: next.passAssignedEnabled,
        sessionRemindersEnabled: next.sessionRemindersEnabled
      })

      if (!result.ok) {
        setPreferences(previous)
        toast.error(result.error ?? "No se pudieron guardar las preferencias.")
      }
    })
  }

  return (
    <Card className="panel-hover">
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3 lg:p-6">
        <CardTitle className="text-base sm:text-lg">Notificaciones push</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0 lg:p-6 lg:pt-0">
        <div className="rounded-2xl border border-border/70 bg-surface-alt/40 p-3 sm:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-primary">
                {isRegistered ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  {isRegistered ? "Este dispositivo esta registrado" : "Este dispositivo no esta registrado"}
                </p>
                <p className="mt-1 text-[13px] leading-5 text-text-secondary sm:text-sm">
                  Permiso del navegador: {permission === "granted" ? "concedido" : permission === "denied" ? "bloqueado" : "pendiente"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="h-11" onClick={activate} disabled={isPending || isRegistered || !isSupported}>
                Activar notificaciones
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={deactivate}
                disabled={isPending || !isRegistered}
              >
                Desactivar notificaciones
              </Button>
            </div>
          </div>
        </div>

        {isIos && !isStandalone ? (
          <div className="rounded-2xl border border-primary/20 bg-primary-soft/35 p-3 text-sm text-text-secondary sm:p-4">
            <div className="flex gap-3">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p>
                En iPhone o iPad instala Trainium primero: abre esta pagina en Safari, toca Compartir,
                elige Anadir a pantalla de inicio y abre Trainium desde el nuevo icono.
              </p>
            </div>
          </div>
        ) : null}

        {!isSupported ? (
          <p className="text-sm text-text-secondary">
            Este navegador no soporta notificaciones push web.
          </p>
        ) : null}

        <div className="space-y-3">
          <PreferenceToggle
            label="Avisos de caducidad de bono"
            checked={preferences.passExpiryEnabled}
            disabled={isPending}
            onChange={(checked) => updatePreference("passExpiryEnabled", checked)}
          />
          <PreferenceToggle
            label="Confirmación de nuevo bono o renovación"
            checked={preferences.passAssignedEnabled}
            disabled={isPending}
            onChange={(checked) => updatePreference("passAssignedEnabled", checked)}
          />
          <PreferenceToggle
            label="Recordatorio de sesión el mismo día"
            checked={preferences.sessionRemindersEnabled}
            disabled={isPending}
            onChange={(checked) => updatePreference("sessionRemindersEnabled", checked)}
          />
        </div>
      </CardContent>
    </Card>
  )
}
