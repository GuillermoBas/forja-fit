"use client"

import { useActionState, useEffect, useMemo, useState, type FormEvent } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { upsertStrengthMetricAction, type StrengthMetricActionState } from "@/features/strength-metrics/actions"
import type { StrengthMetric } from "@/types/domain"

function MetricSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Guardando..." : "Guardar"}
    </Button>
  )
}

function ActionToast({
  error,
  success
}: {
  error?: string
  success?: boolean
}) {
  const router = useRouter()

  useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  useEffect(() => {
    if (success) {
      toast.success("Métrica guardada correctamente.")
      router.refresh()
    }
  }, [router, success])

  return null
}

function normalizeMetricName(value: string) {
  return value.trim().toLocaleLowerCase("es")
}

function useMetricFormValidation({
  metrics,
  metricId
}: {
  metrics: StrengthMetric[]
  metricId?: string
}) {
  const [validationError, setValidationError] = useState<string | null>(null)

  function validateSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const isActive = formData.get("isActive") === "on"

    if (!name) {
      event.preventDefault()
      setValidationError("El nombre es obligatorio.")
      return
    }

    if (isActive) {
      const normalizedName = normalizeMetricName(name)
      const duplicate = metrics.some((metric) => (
        metric.id !== metricId &&
        metric.isActive &&
        normalizeMetricName(metric.name) === normalizedName
      ))

      if (duplicate) {
        event.preventDefault()
        setValidationError("Ya existe una métrica activa con ese nombre.")
        return
      }
    }

    setValidationError(null)
  }

  return { validationError, setValidationError, validateSubmit }
}

function MetricRowForm({
  metric,
  metrics
}: {
  metric: StrengthMetric
  metrics: StrengthMetric[]
}) {
  const [state, formAction] = useActionState(upsertStrengthMetricAction, {} as StrengthMetricActionState)
  const { validationError, setValidationError, validateSubmit } = useMetricFormValidation({
    metrics,
    metricId: metric.id
  })
  const nameInputId = `strength-metric-name-${metric.id}`
  const unitInputId = `strength-metric-unit-${metric.id}`
  const orderInputId = `strength-metric-order-${metric.id}`
  const activeInputId = `strength-metric-active-${metric.id}`
  const errorId = `strength-metric-error-${metric.id}`

  return (
    <form
      action={formAction}
      onSubmit={validateSubmit}
      className="grid gap-4 rounded-2xl border border-border/80 p-4 lg:grid-cols-[minmax(0,1.5fr)_8rem_8rem_auto_auto]"
    >
      <ActionToast error={state.error} success={state.success} />
      <input type="hidden" name="id" value={metric.id} />
      <input type="hidden" name="unit" value={metric.unit || "kg"} />

      <div className="space-y-2">
        <label htmlFor={nameInputId} className="text-sm font-medium">Nombre</label>
        <Input
          id={nameInputId}
          name="name"
          defaultValue={metric.name}
          aria-invalid={Boolean(validationError || state.error)}
          aria-describedby={validationError ? errorId : undefined}
          onChange={() => setValidationError(null)}
        />
        {validationError ? (
          <p id={errorId} className="text-sm text-destructive">{validationError}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor={unitInputId} className="text-sm font-medium">Unidad</label>
        <Input
          id={unitInputId}
          value={metric.unit || "kg"}
          readOnly
          aria-readonly="true"
          className="bg-surface-alt text-text-secondary"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={orderInputId} className="text-sm font-medium">Orden</label>
        <Input
          id={orderInputId}
          name="displayOrder"
          type="number"
          min={0}
          step={1}
          defaultValue={metric.displayOrder}
        />
      </div>

      <label htmlFor={activeInputId} className="flex items-center gap-2 text-sm lg:self-end lg:pb-3">
        <input id={activeInputId} type="checkbox" name="isActive" defaultChecked={metric.isActive} />
        Activa
      </label>

      <div className="flex flex-wrap items-center gap-3 lg:self-end">
        <Badge variant={metric.isActive ? "success" : "secondary"}>
          {metric.isActive ? "Activa" : "Inactiva"}
        </Badge>
        <MetricSubmitButton />
      </div>
    </form>
  )
}

function NewMetricForm({
  metrics,
  onCancel,
  onSaved
}: {
  metrics: StrengthMetric[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [state, formAction] = useActionState(upsertStrengthMetricAction, {} as StrengthMetricActionState)
  const { validationError, setValidationError, validateSubmit } = useMetricFormValidation({ metrics })

  useEffect(() => {
    if (state.success) {
      onSaved()
    }
  }, [onSaved, state.success])

  return (
    <form
      action={formAction}
      onSubmit={validateSubmit}
      className="grid gap-4 rounded-2xl border border-dashed border-primary/30 bg-primary-soft/20 p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_8rem_8rem_auto]"
    >
      <ActionToast error={state.error} success={state.success} />
      <input type="hidden" name="unit" value="kg" />

      <div className="space-y-2">
        <label htmlFor="new-strength-metric-name" className="text-sm font-medium">Nombre</label>
        <Input
          id="new-strength-metric-name"
          name="name"
          aria-invalid={Boolean(validationError || state.error)}
          aria-describedby={validationError ? "new-strength-metric-error" : undefined}
          onChange={() => setValidationError(null)}
          autoFocus
        />
        {validationError ? (
          <p id="new-strength-metric-error" className="text-sm text-destructive">{validationError}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="new-strength-metric-unit" className="text-sm font-medium">Unidad</label>
        <Input
          id="new-strength-metric-unit"
          value="kg"
          readOnly
          aria-readonly="true"
          className="bg-surface-alt text-text-secondary"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="new-strength-metric-order" className="text-sm font-medium">Orden</label>
        <Input
          id="new-strength-metric-order"
          name="displayOrder"
          type="number"
          min={0}
          step={1}
          defaultValue={metrics.length ? Math.max(...metrics.map((metric) => metric.displayOrder)) + 1 : 1}
        />
      </div>

      <div className="flex flex-col gap-3 md:col-span-2 xl:col-span-1 xl:self-end">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked />
          Activa
        </label>
        <div className="flex gap-3">
          <MetricSubmitButton />
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  )
}

export function StrengthMetricsSettingsCard({
  metrics
}: {
  metrics: StrengthMetric[]
}) {
  const [isAdding, setIsAdding] = useState(false)
  const sortedMetrics = useMemo(
    () => [...metrics].sort((left, right) => (
      left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "es")
    )),
    [metrics]
  )

  return (
    <Card className="rounded-3xl xl:col-span-2">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Pesos máximos</CardTitle>
          <CardDescription>
            Configura las métricas que el equipo usará para registrar marcas de fuerza por cliente.
          </CardDescription>
        </div>
        {!isAdding ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            Añadir métrica
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdding ? (
          <NewMetricForm
            metrics={sortedMetrics}
            onCancel={() => setIsAdding(false)}
            onSaved={() => setIsAdding(false)}
          />
        ) : null}

        {sortedMetrics.length ? (
          <div className="space-y-3">
            {sortedMetrics.map((metric) => (
              <MetricRowForm key={metric.id} metric={metric} metrics={sortedMetrics} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            Todavía no hay métricas de peso máximo configuradas.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
