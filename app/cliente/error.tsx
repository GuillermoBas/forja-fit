"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function ClientPortalError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Client portal route error", error)
  }, [error])

  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-red-950"
    >
      <p className="font-semibold">No se pudo cargar esta pantalla</p>
      <p className="mt-1 text-sm leading-5 text-red-800">
        Recarga el contenido. Si vuelve a ocurrir, el equipo podra revisarlo sin que pierdas la sesion.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-red-700">Codigo: {error.digest}</p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="mt-3 bg-white"
        onClick={reset}
      >
        Reintentar
      </Button>
    </div>
  )
}
