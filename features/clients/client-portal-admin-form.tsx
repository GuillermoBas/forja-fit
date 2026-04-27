"use client"

import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  setClientPortalAccountStatusAction,
  unlinkClientPortalAccountAction,
  type ClientActionState
} from "@/features/clients/actions"

const initialState: ClientActionState = {}

export function ClientPortalAdminForm({
  clientId,
  portalStatus
}: {
  clientId: string
  portalStatus?: "claimed" | "disabled" | null
}) {
  const [statusState, statusFormAction] = useActionState(setClientPortalAccountStatusAction, initialState)
  const [unlinkState, unlinkFormAction] = useActionState(unlinkClientPortalAccountAction, initialState)
  const hasPortalAccount = Boolean(portalStatus)

  useEffect(() => {
    if (statusState.error) {
      toast.error(statusState.error)
    }
  }, [statusState.error])

  useEffect(() => {
    if (statusState.success) {
      toast.success(
        portalStatus === "disabled"
          ? "Cuenta de portal reactivada correctamente."
          : "Cuenta de portal desactivada correctamente."
      )
    }
  }, [portalStatus, statusState.success])

  useEffect(() => {
    if (unlinkState.error) {
      toast.error(unlinkState.error)
    }
  }, [unlinkState.error])

  useEffect(() => {
    if (unlinkState.success) {
      toast.success("Cuenta de portal desvinculada correctamente.")
    }
  }, [unlinkState.success])

  return (
    <div className="flex flex-wrap gap-2">
      {hasPortalAccount ? (
        <form
          action={statusFormAction}
          onSubmit={(event) => {
            const message = portalStatus === "disabled"
              ? "Vas a reactivar la cuenta del portal de este cliente. ¿Quieres continuar?"
              : "Vas a desactivar la cuenta del portal de este cliente. El cliente no podra entrar hasta volver a reactivarla. ¿Quieres continuar?"

            if (!window.confirm(message)) {
              event.preventDefault()
            }
          }}
        >
          <input type="hidden" name="clientId" value={clientId} />
          <input
            type="hidden"
            name="status"
            value={portalStatus === "disabled" ? "claimed" : "disabled"}
          />
          <Button type="submit" variant="outline" size="sm">
            {portalStatus === "disabled" ? "Reactivar portal" : "Desactivar portal"}
          </Button>
        </form>
      ) : null}

      <form
        action={unlinkFormAction}
        onSubmit={(event) => {
          if (!window.confirm("Vas a desvincular la cuenta del portal de este cliente. El acceso del cliente dejara de funcionar hasta volver a reclamarlo. ¿Quieres continuar?")) {
            event.preventDefault()
          }
        }}
      >
        <input type="hidden" name="clientId" value={clientId} />
        <Button type="submit" variant="outline" size="sm" disabled={!hasPortalAccount}>
          Desvincular portal
        </Button>
      </form>
    </div>
  )
}
