"use client"

import { useEffect, useMemo, useState } from "react"
import { useFormState } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { Client, Pass, PassType } from "@/types/domain"
import {
  consumeSessionAction,
  createPassAction,
  pausePassAction,
  renewPassAction
} from "@/features/clients/actions"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { nativeSelectClassName } from "@/lib/utils"

function useClientActionFeedback(error?: string, success?: boolean, successMessage?: string) {
  const router = useRouter()

  useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  useEffect(() => {
    if (!success) {
      return
    }

    if (successMessage) {
      toast.success(successMessage)
    }

    router.refresh()
  }, [router, success, successMessage])
}

function HolderSelectFields({
  clients,
  primaryClientId,
  isSharedAllowed
}: {
  clients: Client[]
  primaryClientId: string
  isSharedAllowed: boolean
}) {
  const visibleSlots = isSharedAllowed ? 5 : 1

  return (
    <>
      {Array.from({ length: visibleSlots }, (_, index) => (
        <div key={index} className="space-y-2">
          <label className="text-sm font-medium">
            {index === 0 ? "Titular principal" : `Titular ${index + 1} (opcional)`}
          </label>
          <select
            name="holderClientIds"
            defaultValue={index === 0 ? primaryClientId : ""}
            className={nativeSelectClassName}
          >
            <option value="">{index === 0 ? "Selecciona un cliente" : "Sin asignar"}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.fullName}
              </option>
            ))}
          </select>
        </div>
      ))}
    </>
  )
}

export function CreatePassForm({
  clientId,
  clients,
  passTypes
}: {
  clientId: string
  clients: Client[]
  passTypes: PassType[]
}) {
  const [state, formAction] = useFormState(createPassAction, {})
  const [selectedPassTypeId, setSelectedPassTypeId] = useState(passTypes[0]?.id ?? "")
  const [priceGross, setPriceGross] = useState(
    passTypes[0] ? String(Math.round(passTypes[0].price)) : ""
  )
  const selectedPassType = useMemo(
    () => passTypes.find((item) => item.id === selectedPassTypeId) ?? passTypes[0] ?? null,
    [passTypes, selectedPassTypeId]
  )

  useEffect(() => {
    if (!selectedPassType) {
      return
    }

    setPriceGross(String(Math.round(selectedPassType.price)))
  }, [selectedPassType])

  useClientActionFeedback(state?.error, state?.success, "Bono creado correctamente.")

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle>Crear bono</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo de bono</label>
            <select
              name="passTypeId"
              value={selectedPassTypeId}
              onChange={(event) => setSelectedPassTypeId(event.target.value)}
              className={nativeSelectClassName}
            >
              {passTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Contratado el</label>
            <Input name="contractedOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <HolderSelectFields
            clients={clients}
            primaryClientId={clientId}
            isSharedAllowed={selectedPassType?.sharedAllowed ?? true}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium">Pagado por</label>
            <select
              name="purchasedByClientId"
              defaultValue={clientId}
              className={nativeSelectClassName}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Método de pago</label>
            <select name="paymentMethod" className={nativeSelectClassName}>
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
              <option value="bizum">Bizum</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Precio pactado (EUR)</label>
            <Input
              name="priceGross"
              type="number"
              min={0}
              step={1}
              value={priceGross}
              onChange={(event) => setPriceGross(event.target.value)}
              placeholder="Importe entero en euros"
            />
          </div>
          <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            {selectedPassType?.kind === "monthly"
              ? "El bono mensual se consume por mes natural y no descontará sesiones."
              : `Este bono arrancará con ${selectedPassType?.sessionCount ?? 0} sesiones disponibles.`}
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Notas</label>
            <Input name="notes" />
          </div>
          <div className="md:col-span-2">
            <AuthFormSubmit idleLabel="Crear bono" pendingLabel="Creando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ConsumeSessionForm({
  clientId,
  passes
}: {
  clientId: string
  passes: Pass[]
}) {
  const [state, formAction] = useFormState(consumeSessionAction, {})
  const sessionPasses = passes.filter((item) => item.passKind === "session")

  useClientActionFeedback(state?.error, state?.success, "Sesión registrada correctamente.")

  return (
    <Card className="rounded-3xl">
      <CardHeader><CardTitle>Consumir sesión</CardTitle></CardHeader>
      <CardContent>
        {sessionPasses.length ? (
          <form action={formAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="clientId" value={clientId} />
            <div className="space-y-2">
              <label className="text-sm font-medium">Bono</label>
              <select name="passId" className={nativeSelectClassName}>
                {sessionPasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.passTypeName} ({item.sessionsLeft ?? 0} restantes)
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha y hora</label>
              <Input name="consumedAt" type="datetime-local" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Notas</label>
              <Input name="notes" />
            </div>
            <div className="md:col-span-2">
              <AuthFormSubmit idleLabel="Consumir sesión" pendingLabel="Guardando..." />
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Este cliente no tiene bonos por sesiones disponibles para consumo manual.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function PausePassForm({
  clientId,
  passes
}: {
  clientId: string
  passes: Pass[]
}) {
  const [state, formAction] = useFormState(pausePassAction, {})
  useClientActionFeedback(state?.error, state?.success, "Bono pausado correctamente.")

  return (
    <Card className="rounded-3xl">
      <CardHeader><CardTitle>Pausar bono</CardTitle></CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="clientId" value={clientId} />
          <div className="space-y-2">
            <label className="text-sm font-medium">Bono</label>
            <select name="passId" className={nativeSelectClassName}>
              {passes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.passTypeName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Inicio</label>
            <Input name="startsOn" type="date" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Fin</label>
            <Input name="endsOn" type="date" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivo</label>
            <Input name="reason" />
          </div>
          <div className="md:col-span-2">
            <AuthFormSubmit idleLabel="Pausar bono" pendingLabel="Guardando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function RenewPassForm({
  clientId,
  passes,
  passTypes
}: {
  clientId: string
  passes: Pass[]
  passTypes: PassType[]
}) {
  const [state, formAction] = useFormState(renewPassAction, {})
  const [selectedPassId, setSelectedPassId] = useState(passes[0]?.id ?? "")
  const selectedPass = useMemo(
    () => passes.find((item) => item.id === selectedPassId) ?? passes[0] ?? null,
    [passes, selectedPassId]
  )
  const [priceGross, setPriceGross] = useState(
    selectedPass ? String(Math.round(selectedPass.soldPriceGross)) : ""
  )

  useEffect(() => {
    if (!selectedPass) {
      return
    }

    setPriceGross(String(Math.round(selectedPass.soldPriceGross)))
  }, [selectedPass])

  useClientActionFeedback(state?.error, state?.success, "Bono renovado correctamente.")

  return (
    <Card className="rounded-3xl">
      <CardHeader><CardTitle>Renovar bono</CardTitle></CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="clientId" value={clientId} />
          <div className="space-y-2">
            <label className="text-sm font-medium">Bono a renovar</label>
            <select
              name="passId"
              value={selectedPassId}
              onChange={(event) => setSelectedPassId(event.target.value)}
              className={nativeSelectClassName}
            >
              {passes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.passTypeName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Nuevo tipo</label>
            <select name="passTypeId" className={nativeSelectClassName}>
              {passTypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Método de pago</label>
            <select name="paymentMethod" className={nativeSelectClassName}>
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
              <option value="bizum">Bizum</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Precio renovado (EUR)</label>
            <Input
              name="priceGross"
              type="number"
              min={0}
              step={1}
              value={priceGross}
              onChange={(event) => setPriceGross(event.target.value)}
              placeholder="Importe entero en euros"
            />
            <p className="text-xs text-muted-foreground">
              Se precarga el precio del bono original, pero puedes ajustarlo si cambia la tarifa.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Contratado el</label>
            <Input name="contractedOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Notas</label>
            <Input name="notes" />
          </div>
          <div className="md:col-span-2">
            <AuthFormSubmit idleLabel="Renovar bono" pendingLabel="Renovando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
