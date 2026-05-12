"use client"

import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { recordClientMaxWeightEntriesAction } from "@/features/strength-metrics/actions"
import {
  buildClientMaxWeightSummary,
  formatKg,
  formatKgWithUnit,
  formatShortDate,
  formatWeightChange,
  getEntriesForMetric,
  getMetricsWithEntries,
  sortStrengthMetrics
} from "@/features/strength-metrics/client-max-weight-summary"
import { formatDate, nativeSelectClassName } from "@/lib/utils"
import type { ClientMaxWeightEntry, StrengthMetric } from "@/types/domain"

type FieldErrors = Record<string, string>

function SaveMaxWeightsButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : "Guardar registro"}
    </Button>
  )
}

function normalizeWeightInput(value: string) {
  return value.trim().replace(",", ".")
}

function getWeightInputError(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const normalized = normalizeWeightInput(trimmed)
  const parsed = Number(normalized)

  if (!Number.isFinite(parsed)) {
    return "Introduce un peso válido."
  }

  if (parsed < 0) {
    return "El peso no puede ser negativo."
  }

  if (!/^\d+(?:\.\d)?$/.test(normalized)) {
    return "Solo se permite un decimal."
  }

  return null
}

function LineChart({
  entries
}: {
  entries: ClientMaxWeightEntry[]
}) {
  if (!entries.length) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
        Todavía no hay pesos máximos registrados para este cliente.
      </div>
    )
  }

  const values = entries.map((entry) => entry.valueKg)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueRange = Math.max(maxValue - minValue, 1)
  const width = 640
  const height = 220
  const paddingX = 42
  const paddingY = 24
  const chartWidth = width - paddingX * 2
  const chartHeight = height - paddingY * 2
  const points = entries.map((entry, index) => {
    const x = entries.length === 1
      ? paddingX + chartWidth / 2
      : paddingX + (index / (entries.length - 1)) * chartWidth
    const y = paddingY + ((maxValue - entry.valueKg) / valueRange) * chartHeight

    return { entry, x, y }
  })
  const pathData = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")

  return (
    <div className="rounded-2xl border border-border/80 bg-surface-alt/40 p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Evolución histórica de pesos máximos"
        className="h-56 w-full"
      >
        <line x1={paddingX} y1={paddingY} x2={paddingX} y2={height - paddingY} className="stroke-border" />
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} className="stroke-border" />
        <text x={paddingX - 10} y={paddingY + 4} textAnchor="end" className="fill-text-secondary text-[11px]">
          {formatKg(maxValue)}
        </text>
        <text x={paddingX - 10} y={height - paddingY + 4} textAnchor="end" className="fill-text-secondary text-[11px]">
          {formatKg(minValue)}
        </text>
        {entries.length > 1 ? (
          <path d={pathData} fill="none" className="stroke-primary" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {points.map((point) => (
          <g key={point.entry.id}>
            <circle cx={point.x} cy={point.y} r="6" className="fill-primary stroke-white" strokeWidth="3">
              <title>{`${formatDate(point.entry.entryDate)} - ${formatKgWithUnit(point.entry.valueKg)}`}</title>
            </circle>
          </g>
        ))}
        <text x={paddingX} y={height - 6} className="fill-text-secondary text-[11px]">
          {formatShortDate(entries[0]?.entryDate ?? "")}
        </text>
        <text x={width - paddingX} y={height - 6} textAnchor="end" className="fill-text-secondary text-[11px]">
          {formatShortDate(entries[entries.length - 1]?.entryDate ?? "")}
        </text>
      </svg>
      {entries.length === 1 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Aún no hay suficientes registros para mostrar evolución.
        </p>
      ) : null}
    </div>
  )
}

export function ClientMaxWeightsCard({
  clientId,
  metrics,
  entries
}: {
  clientId: string
  metrics: StrengthMetric[]
  entries: ClientMaxWeightEntry[]
}) {
  const activeMetrics = useMemo(
    () => metrics
      .filter((metric) => metric.isActive)
      .sort(sortStrengthMetrics),
    [metrics]
  )
  const reviewMetrics = useMemo(
    () => getMetricsWithEntries(metrics, entries),
    [entries, metrics]
  )
  const summary = useMemo(
    () => buildClientMaxWeightSummary({ metrics: activeMetrics, entries }),
    [activeMetrics, entries]
  )
  const initialSelectedMetricId = reviewMetrics[0]?.id ?? activeMetrics[0]?.id ?? ""
  const [selectedMetricId, setSelectedMetricId] = useState(initialSelectedMetricId)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [state, formAction] = useActionState(recordClientMaxWeightEntriesAction, {})
  const entriesInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!selectedMetricId && initialSelectedMetricId) {
      setSelectedMetricId(initialSelectedMetricId)
      return
    }

    if (selectedMetricId && !reviewMetrics.some((metric) => metric.id === selectedMetricId)) {
      setSelectedMetricId(initialSelectedMetricId)
    }
  }, [initialSelectedMetricId, reviewMetrics, selectedMetricId])

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  useEffect(() => {
    if (state.success) {
      toast.success("Registro guardado correctamente.")
      router.refresh()
    }
  }, [router, state.success])

  const selectedMetric = reviewMetrics.find((metric) => metric.id === selectedMetricId) ?? reviewMetrics[0] ?? null
  const selectedEntriesAsc = selectedMetric
    ? getEntriesForMetric(entries, selectedMetric.id, "asc")
    : []
  const selectedEntriesDesc = selectedMetric
    ? getEntriesForMetric(entries, selectedMetric.id, "desc")
    : []
  const hasAnyEntry = entries.length > 0
  const hasVisibleContent = activeMetrics.length > 0 || reviewMetrics.length > 0

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget)
    const nextErrors: FieldErrors = {}
    const payload = activeMetrics.flatMap((metric) => {
      const rawValue = String(formData.get(`weight_${metric.id}`) ?? "").trim()
      const error = getWeightInputError(rawValue)

      if (error) {
        nextErrors[metric.id] = error
        return []
      }

      if (!rawValue) {
        return []
      }

      return [{
        metricId: metric.id,
        valueKg: Number(normalizeWeightInput(rawValue))
      }]
    })

    if (Object.keys(nextErrors).length > 0) {
      event.preventDefault()
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})
    if (entriesInputRef.current) {
      entriesInputRef.current.value = JSON.stringify(payload)
    }
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle>Pesos máximos</CardTitle>
        <CardDescription>
          Registra y revisa las mejores marcas del cliente por ejercicio o máquina.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasVisibleContent ? (
          <>
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Resumen de pesos máximos">
              {summary.map((item) => (
                <div key={item.metric.id} className="rounded-2xl border border-border/80 p-4">
                  <p className="text-sm font-medium text-text-secondary">{item.metric.name}</p>
                  {item.latestEntry ? (
                    <div className="mt-2 space-y-1">
                      <p className="font-heading text-2xl font-bold text-text-primary">
                        {formatKgWithUnit(item.latestEntry.valueKg)}
                      </p>
                      <p className="text-sm text-muted-foreground">{formatDate(item.latestEntry.entryDate)}</p>
                      <p className="text-sm font-semibold text-primary-hover">
                        {formatWeightChange(item.changeKg)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Sin registros</p>
                  )}
                </div>
              ))}
            </section>

            {activeMetrics.length ? (
            <form action={formAction} onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-border/80 p-4 md:grid-cols-2 xl:grid-cols-3">
              <input type="hidden" name="clientId" value={clientId} />
              <input ref={entriesInputRef} type="hidden" name="entries" value="[]" />
              <div className="space-y-2">
                <label htmlFor="max-weight-entry-date" className="text-sm font-medium">Fecha</label>
                <Input
                  id="max-weight-entry-date"
                  name="entryDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
              {activeMetrics.map((metric) => {
                const inputId = `max-weight-${metric.id}`
                const errorId = `max-weight-${metric.id}-error`
                const error = fieldErrors[metric.id]

                return (
                  <div key={metric.id} className="space-y-2">
                    <label htmlFor={inputId} className="text-sm font-medium">{metric.name}</label>
                    <Input
                      id={inputId}
                      name={`weight_${metric.id}`}
                      inputMode="decimal"
                      placeholder="0,0 kg"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? errorId : undefined}
                      onChange={() => setFieldErrors((current) => {
                        if (!current[metric.id]) {
                          return current
                        }
                        const next = { ...current }
                        delete next[metric.id]
                        return next
                      })}
                    />
                    {error ? (
                      <p id={errorId} className="text-sm text-destructive">{error}</p>
                    ) : null}
                  </div>
                )
              })}
              <div className="md:col-span-2 xl:col-span-3">
                <SaveMaxWeightsButton />
              </div>
            </form>
            ) : (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                No hay métricas activas para nuevos registros. Puedes consultar el historial existente.
              </div>
            )}

            <section className="space-y-4" aria-label="Histórico de pesos máximos">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">Evolución histórica</h3>
                  <p className="text-sm text-muted-foreground">
                    Selecciona una métrica con registros. Las inactivas se mantienen solo para consulta histórica.
                  </p>
                </div>
                {reviewMetrics.length ? (
                  <div className="w-full space-y-2 md:max-w-xs">
                    <label htmlFor="max-weight-selected-metric" className="text-sm font-medium">Métrica</label>
                    <select
                      id="max-weight-selected-metric"
                      value={selectedMetric?.id ?? ""}
                      onChange={(event) => setSelectedMetricId(event.target.value)}
                      className={nativeSelectClassName}
                    >
                      {reviewMetrics.map((metric) => (
                        <option key={metric.id} value={metric.id}>
                          {metric.name}{metric.isActive ? "" : " (inactiva)"}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              {selectedMetric ? <LineChart entries={selectedEntriesAsc} /> : null}

              {selectedEntriesDesc.length ? (
                <div className="overflow-x-auto rounded-2xl border border-border/80">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead className="bg-surface-alt/70 text-text-secondary">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Fecha</th>
                        <th className="px-4 py-3 font-semibold">Peso</th>
                        <th className="px-4 py-3 font-semibold">Registrado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntriesDesc.map((entry) => (
                        <tr key={entry.id} className="border-t border-border/70">
                          <td className="px-4 py-3">{formatDate(entry.entryDate)}</td>
                          <td className="px-4 py-3 font-semibold">{formatKgWithUnit(entry.valueKg)}</td>
                          <td className="px-4 py-3 text-text-secondary">{entry.createdByName ?? "Sin indicar"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  {hasAnyEntry
                    ? "No hay registros para la métrica seleccionada."
                    : "Todavía no hay pesos máximos registrados para este cliente."}
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
            Todavía no hay métricas activas de peso máximo configuradas.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
