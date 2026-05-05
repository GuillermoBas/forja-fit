"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { Client, Pass, PassType } from "@/types/domain"
import {
  consumeSessionAction,
  createPassAction,
  pausePassAction,
  renewPassAction,
  scheduleExistingPassSessionsAction
} from "@/features/clients/actions"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { nativeSelectClassName } from "@/lib/utils"

const passSubTypeOptions = [
  { value: "individual", label: "Individual" },
  { value: "shared_2", label: "Compartido 2" },
  { value: "shared_3", label: "Compartido 3" }
] as const

const weeklyDayOptions = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" }
] as const

const fixedHourOptions = Array.from({ length: 16 }, (_, index) => {
  const hour = String(index + 7).padStart(2, "0")
  return `${hour}:00`
})

export type TrainerOption = {
  id: string
  fullName: string
}

type WeeklySchedulePatternEntry = {
  weekday: number
  weekdayLabel: string
  hour: string
  trainerProfileId: string
  trainerName: string
}

function ScreenModal({
  children
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    return () => {
      setMounted(false)
    }
  }, [])

  if (!mounted) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      {children}
    </div>,
    document.body
  )
}

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

function comparePatternEntries(a: WeeklySchedulePatternEntry, b: WeeklySchedulePatternEntry) {
  if (a.weekday !== b.weekday) {
    return a.weekday - b.weekday
  }

  if (a.hour !== b.hour) {
    return a.hour.localeCompare(b.hour)
  }

  return a.trainerName.localeCompare(b.trainerName, "es")
}

function WeeklySchedulePatternField({
  trainerProfiles,
  isSessionPass,
  helperText
}: {
  trainerProfiles: TrainerOption[]
  isSessionPass: boolean
  helperText: string
}) {
  const [entries, setEntries] = useState<WeeklySchedulePatternEntry[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedWeekday, setSelectedWeekday] = useState(String(weeklyDayOptions[0]?.value ?? 1))
  const [selectedHour, setSelectedHour] = useState(fixedHourOptions[0] ?? "07:00")
  const [selectedTrainerProfileId, setSelectedTrainerProfileId] = useState(trainerProfiles[0]?.id ?? "")

  useEffect(() => {
    if (!trainerProfiles.length) {
      setSelectedTrainerProfileId("")
      return
    }

    setSelectedTrainerProfileId((currentValue) => {
      if (trainerProfiles.some((trainer) => trainer.id === currentValue)) {
        return currentValue
      }

      return trainerProfiles[0]?.id ?? ""
    })
  }, [trainerProfiles])

  const serializedEntries = JSON.stringify(
    entries.map((entry) => ({
      weekday: entry.weekday,
      hour: entry.hour,
      trainerProfileId: entry.trainerProfileId
    }))
  )

  function closeDialog() {
    setIsDialogOpen(false)
  }

  function handleAddEntry() {
    const weekday = Number(selectedWeekday)
    const weekdayLabel = weeklyDayOptions.find((option) => option.value === weekday)?.label ?? ""
    const trainer = trainerProfiles.find((item) => item.id === selectedTrainerProfileId)

    if (!weekdayLabel || !selectedHour || !trainer) {
      toast.error("Completa el día, la hora y el entrenador para añadir el patrón.")
      return
    }

    const duplicate = entries.some((entry) => (
      entry.weekday === weekday
      && entry.hour === selectedHour
      && entry.trainerProfileId === selectedTrainerProfileId
    ))

    if (duplicate) {
      toast.error("Ese día, hora y entrenador ya están añadidos al patrón.")
      return
    }

    setEntries((currentEntries) => (
      [
        ...currentEntries,
        {
          weekday,
          weekdayLabel,
          hour: selectedHour,
          trainerProfileId: trainer.id,
          trainerName: trainer.fullName
        }
      ].sort(comparePatternEntries)
    ))
    closeDialog()
  }

  function handleRemoveEntry(entryToRemove: WeeklySchedulePatternEntry) {
    setEntries((currentEntries) => currentEntries.filter((entry) => !(
      entry.weekday === entryToRemove.weekday
      && entry.hour === entryToRemove.hour
      && entry.trainerProfileId === entryToRemove.trainerProfileId
    )))
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="schedulePattern" value={serializedEntries} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <label className="text-sm font-medium">Patrón semanal de agenda</label>
          <p className="text-xs text-muted-foreground">{helperText}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          disabled={!isSessionPass || !trainerProfiles.length}
        >
          Añadir día
        </Button>
      </div>

      {!isSessionPass ? (
        <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          Este tipo de bono no usa sesiones, así que no necesita agenda automática.
        </div>
      ) : null}

      {isSessionPass && !trainerProfiles.length ? (
        <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          No hay entrenadores activos disponibles para programar sesiones.
        </div>
      ) : null}

      {isSessionPass && trainerProfiles.length ? (
        entries.length ? (
          <div className="overflow-hidden rounded-2xl border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Día de la semana</th>
                  <th className="px-4 py-3 text-left font-medium">Hora</th>
                  <th className="px-4 py-3 text-left font-medium">Entrenador</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr key={`${entry.weekday}-${entry.hour}-${entry.trainerProfileId}`}>
                    <td className="px-4 py-3">{entry.weekdayLabel}</td>
                    <td className="px-4 py-3">{entry.hour}</td>
                    <td className="px-4 py-3">{entry.trainerName}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveEntry(entry)}
                      >
                        Quitar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            Todavía no has añadido ningún día al patrón semanal.
          </div>
        )
      ) : null}

      {isDialogOpen ? (
        <ScreenModal>
          <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-2xl">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Añadir día al patrón</h3>
              <p className="text-sm text-muted-foreground">
                Define un día fijo, una hora cerrada y el entrenador que llevará esa sesión.
              </p>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Día de la semana</label>
                <select
                  value={selectedWeekday}
                  onChange={(event) => setSelectedWeekday(event.target.value)}
                  className={nativeSelectClassName}
                >
                  {weeklyDayOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Hora</label>
                <select
                  value={selectedHour}
                  onChange={(event) => setSelectedHour(event.target.value)}
                  className={nativeSelectClassName}
                >
                  {fixedHourOptions.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Entrenador</label>
                <select
                  value={selectedTrainerProfileId}
                  onChange={(event) => setSelectedTrainerProfileId(event.target.value)}
                  className={nativeSelectClassName}
                >
                  {trainerProfiles.map((trainer) => (
                    <option key={trainer.id} value={trainer.id}>
                      {trainer.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleAddEntry}>
                Añadir
              </Button>
            </div>
          </div>
        </ScreenModal>
      ) : null}
    </div>
  )
}

export function ScheduleExistingPassForm({
  clientId,
  pass,
  trainerProfiles
}: {
  clientId: string
  pass: Pass
  trainerProfiles: TrainerOption[]
}) {
  const [state, formAction] = useActionState(scheduleExistingPassSessionsAction, {})
  const [isOpen, setIsOpen] = useState(false)
  const canSchedule = pass.passKind === "session"

  useClientActionFeedback(state?.error, state?.success, "Sesiones pendientes agendadas correctamente.")

  useEffect(() => {
    if (state?.success) {
      setIsOpen(false)
    }
  }, [state?.success])

  if (!canSchedule) {
    return null
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        Agendar sesiones
      </Button>

      {isOpen ? (
        <ScreenModal>
          <div className="w-full max-w-3xl rounded-3xl border bg-card p-6 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Agendar sesiones pendientes</h3>
                <p className="text-sm text-muted-foreground">
                  Puedes forzar agenda aunque el bono esté caducado o sin sesiones restantes.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cerrar
              </Button>
            </div>

            <form action={formAction} className="mt-6 space-y-5">
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="passId" value={pass.id} />
              <input type="hidden" name="passTypeId" value={pass.passTypeId} />

              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                {`Se intentará programar agenda pendiente de ${pass.passTypeName}. Si no hay saldo disponible, se creará una sesión forzada.`}
              </div>

              <WeeklySchedulePatternField
                trainerProfiles={trainerProfiles}
                isSessionPass
                helperText="Las sesiones se programarán en orden cronológico desde la fecha de hoy."
              />

              <div className="flex justify-end">
                <AuthFormSubmit idleLabel="Agendar sesiones" pendingLabel="Agendando..." />
              </div>
            </form>
          </div>
        </ScreenModal>
      ) : null}
    </>
  )
}

export function CreatePassForm({
  clientId,
  clients,
  passTypes,
  trainerProfiles
}: {
  clientId: string
  clients: Client[]
  passTypes: PassType[]
  trainerProfiles: TrainerOption[]
}) {
  const [state, formAction] = useActionState(createPassAction, {})
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
            <label className="text-sm font-medium">Sub tipo</label>
            <select name="passSubType" defaultValue="individual" className={nativeSelectClassName}>
              {passSubTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
              ? "El bono mensual se consume por mes natural y no descuenta sesiones."
              : `Este bono arrancará con ${selectedPassType?.sessionCount ?? 0} sesiones disponibles.`}
          </div>
          <div className="md:col-span-2">
            <WeeklySchedulePatternField
              trainerProfiles={trainerProfiles}
              isSessionPass={selectedPassType?.kind === "session"}
              helperText="Las sesiones se programarán en orden cronológico desde la fecha de contratación."
            />
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
  const [state, formAction] = useActionState(consumeSessionAction, {})
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
  const [state, formAction] = useActionState(pausePassAction, {})
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
  passTypes,
  trainerProfiles
}: {
  clientId: string
  passes: Pass[]
  passTypes: PassType[]
  trainerProfiles: TrainerOption[]
}) {
  const [state, formAction] = useActionState(renewPassAction, {})
  const [selectedPassId, setSelectedPassId] = useState(passes[0]?.id ?? "")
  const [selectedPassTypeId, setSelectedPassTypeId] = useState(
    passes[0]?.passTypeId ?? passTypes[0]?.id ?? ""
  )
  const selectedPass = useMemo(
    () => passes.find((item) => item.id === selectedPassId) ?? passes[0] ?? null,
    [passes, selectedPassId]
  )
  const selectedPassType = useMemo(
    () => passTypes.find((item) => item.id === selectedPassTypeId) ?? passTypes[0] ?? null,
    [passTypes, selectedPassTypeId]
  )
  const [priceGross, setPriceGross] = useState(
    selectedPass ? String(Math.round(selectedPass.soldPriceGross)) : ""
  )

  useEffect(() => {
    if (!selectedPass) {
      return
    }

    setSelectedPassTypeId(selectedPass.passTypeId)
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
          <div className="md:col-span-2">
            <WeeklySchedulePatternField
              trainerProfiles={trainerProfiles}
              isSessionPass={selectedPassType?.kind === "session"}
              helperText="Las sesiones se programarán en orden cronológico desde la fecha de contratación."
            />
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
