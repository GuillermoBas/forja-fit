"use client"

import { useActionState, useEffect, useState, type ChangeEvent } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { updateBusinessSettingsAction } from "@/features/settings/actions"
import { getBrandAssetUrl } from "@/lib/branding-shared"
import type { BusinessSettings } from "@/types/domain"

function SaveBusinessSettingsButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : "Guardar cambios"}
    </Button>
  )
}

export function BusinessSettingsCard({
  settings
}: {
  settings: BusinessSettings
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [state, formAction] = useActionState(updateBusinessSettingsAction, {})
  const currentLogoUrl = getBrandAssetUrl(settings.brandAssets, "logo-512-png")
  const previewImageUrl = previewUrl ?? currentLogoUrl

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  useEffect(() => {
    if (state.success) {
      toast.success(state.success)
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current)
        }

        return null
      })
      setIsOpen(false)
    }
  }, [state.success])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  function handleBrandImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  function closeModal() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }

    setIsOpen(false)
  }

  return (
    <>
      <Card className="rounded-3xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle>Negocio</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(true)}>
            Editar
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm sm:flex-row sm:items-center">
          <div
            className="h-20 w-20 shrink-0 rounded-2xl border border-border/90 bg-white bg-contain bg-center bg-no-repeat p-2 shadow-sm"
            style={{ backgroundImage: `url("${currentLogoUrl}")` }}
            aria-label={`Logo actual de ${settings.businessName}`}
          />
          <div className="space-y-3">
            <p><span className="font-medium">Nombre:</span> {settings.businessName}</p>
            <p><span className="font-medium">Zona horaria:</span> {settings.timezone}</p>
            <p><span className="font-medium">Aviso por defecto:</span> {settings.reminderDaysDefault} dias</p>
            <p><span className="font-medium">IVA por defecto:</span> {settings.defaultVatRate}%</p>
          </div>
        </CardContent>
      </Card>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
            <div className="mb-6 space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Editar negocio</h2>
              <p className="text-sm text-slate-600">
                Actualiza los datos operativos generales que usa el panel staff.
              </p>
            </div>

            <form action={formAction} className="space-y-4" encType="multipart/form-data">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre</label>
                <Input name="businessName" defaultValue={settings.businessName} required />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Zona horaria</label>
                <Input value={settings.timezone} disabled className="cursor-not-allowed bg-slate-100 text-slate-500" />
                <p className="text-xs text-slate-500">
                  Este entorno trabaja fijo en Europe/Madrid.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Aviso por defecto (dias)</label>
                  <Input
                    name="reminderDaysDefault"
                    type="number"
                    min="0"
                    max="30"
                    step="1"
                    defaultValue={settings.reminderDaysDefault}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">IVA por defecto (%)</label>
                  <Input
                    name="defaultVatRate"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={settings.defaultVatRate}
                    required
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border/90 bg-slate-50/80 p-4">
                <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
                  <div
                    className="h-24 w-24 rounded-2xl border border-border/90 bg-white bg-contain bg-center bg-no-repeat p-2 shadow-sm"
                    style={{ backgroundImage: `url("${previewImageUrl}")` }}
                    aria-label={`Vista previa del logo de ${settings.businessName}`}
                  />
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Imagen del negocio</label>
                    <Input
                      name="brandImage"
                      type="file"
                      accept="image/png"
                      onChange={handleBrandImageChange}
                    />
                    <p className="text-xs leading-5 text-slate-500">
                      Sube un PNG cuadrado. Al guardar se generan automaticamente los iconos, favicon, PWA y variantes del portal.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancelar
                </Button>
                <SaveBusinessSettingsButton />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
