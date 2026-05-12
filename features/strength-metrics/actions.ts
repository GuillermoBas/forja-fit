"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"

export type StrengthMetricActionState = {
  error?: string
  success?: boolean
}

const oneDecimalNumberSchema = z
  .number()
  .nonnegative("El peso no puede ser negativo.")
  .refine((value) => Number.isFinite(value), "El peso debe ser un numero valido.")
  .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < Number.EPSILON, "El peso solo puede tener un decimal.")

const entryDateSchema = z
  .string()
  .min(1, "La fecha del registro es obligatoria.")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha del registro no tiene un formato valido.")

const strengthMetricSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  unit: z.string().trim().min(1, "La unidad es obligatoria."),
  displayOrder: z.number().int().min(0, "El orden no puede ser negativo."),
  isActive: z.boolean()
})

const maxWeightEntrySchema = z.object({
  metricId: z.string().uuid(),
  valueKg: oneDecimalNumberSchema,
  notes: z.string().optional()
})

function parseOptionalUuid(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim()
  return parsed || undefined
}

export async function upsertStrengthMetricAction(
  _prevState: StrengthMetricActionState,
  formData: FormData
): Promise<StrengthMetricActionState> {
  const payload = {
    id: parseOptionalUuid(formData.get("id")),
    name: String(formData.get("name") ?? "").trim(),
    unit: String(formData.get("unit") ?? "kg").trim() || "kg",
    displayOrder: Number(formData.get("displayOrder") ?? 0),
    isActive: formData.get("isActive") === "on"
  }

  const parsed = strengthMetricSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa la metrica de fuerza." }
  }

  try {
    await invokeProtectedFunction("upsert_strength_metric", parsed.data)
  } catch (error) {
    return toActionError(error, "No se pudo guardar la metrica de fuerza")
  }

  revalidatePath("/settings")
  revalidatePath("/clients")
  revalidatePath("/cliente/dashboard")
  revalidatePath("/cliente/pesos-maximos")
  return { success: true }
}

export async function recordClientMaxWeightEntriesAction(
  _prevState: StrengthMetricActionState,
  formData: FormData
): Promise<StrengthMetricActionState> {
  const clientId = String(formData.get("clientId") ?? "").trim()
  const entryDate = String(formData.get("entryDate") ?? "").trim()
  const rawEntries = String(formData.get("entries") ?? "[]").trim() || "[]"

  if (!clientId) {
    return { error: "No se ha encontrado el cliente." }
  }

  const parsedEntryDate = entryDateSchema.safeParse(entryDate)
  if (!parsedEntryDate.success) {
    return { error: parsedEntryDate.error.issues[0]?.message ?? "La fecha del registro es obligatoria." }
  }

  let entries: Array<{ metricId: string; valueKg: number; notes?: string }>
  try {
    const parsedRaw = JSON.parse(rawEntries)
    entries = Array.isArray(parsedRaw)
      ? parsedRaw
          .filter((entry) => entry?.valueKg !== "" && entry?.valueKg !== null && entry?.valueKg !== undefined)
          .map((entry) => ({
            metricId: String(entry?.metricId ?? ""),
            valueKg: Number(entry?.valueKg),
            notes: String(entry?.notes ?? "").trim()
          }))
      : []
  } catch {
    return { error: "Los registros de fuerza no tienen un formato valido." }
  }

  const parsedEntries = z.array(maxWeightEntrySchema).safeParse(entries)
  if (!parsedEntries.success) {
    return { error: parsedEntries.error.issues[0]?.message ?? "Revisa los pesos introducidos." }
  }

  try {
    await invokeProtectedFunction("record_client_max_weight_entries", {
      clientId,
      entryDate: parsedEntryDate.data,
      entries: parsedEntries.data
    })
  } catch (error) {
    return toActionError(error, "No se pudieron guardar los maximos de fuerza")
  }

  revalidatePath(`/clients/${clientId}`)
  revalidatePath("/cliente/dashboard")
  revalidatePath("/cliente/pesos-maximos")
  return { success: true }
}

export async function updateClientMaxWeightEntryAction(
  _prevState: StrengthMetricActionState,
  formData: FormData
): Promise<StrengthMetricActionState> {
  const entryId = String(formData.get("entryId") ?? "").trim()
  const clientId = String(formData.get("clientId") ?? "").trim()
  const entryDate = String(formData.get("entryDate") ?? "").trim()
  const valueKg = Number(formData.get("valueKg") ?? NaN)
  const parsed = z.object({
    entryId: z.string().uuid(),
    entryDate: entryDateSchema,
    valueKg: oneDecimalNumberSchema,
    notes: z.string().optional()
  }).safeParse({
    entryId,
    entryDate,
    valueKg,
    notes: String(formData.get("notes") ?? "").trim()
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa el registro de fuerza." }
  }

  try {
    await invokeProtectedFunction("update_client_max_weight_entry", parsed.data)
  } catch (error) {
    return toActionError(error, "No se pudo actualizar el maximo de fuerza")
  }

  if (clientId) {
    revalidatePath(`/clients/${clientId}`)
  }
  revalidatePath("/cliente/dashboard")
  revalidatePath("/cliente/pesos-maximos")
  return { success: true }
}

export async function deleteClientMaxWeightEntryAction(
  _prevState: StrengthMetricActionState,
  formData: FormData
): Promise<StrengthMetricActionState> {
  const entryId = String(formData.get("entryId") ?? "").trim()
  const clientId = String(formData.get("clientId") ?? "").trim()

  if (!entryId) {
    return { error: "No se ha encontrado el registro de fuerza." }
  }

  try {
    await invokeProtectedFunction("delete_client_max_weight_entry", { entryId })
  } catch (error) {
    return toActionError(error, "No se pudo borrar el maximo de fuerza")
  }

  if (clientId) {
    revalidatePath(`/clients/${clientId}`)
  }
  revalidatePath("/cliente/dashboard")
  revalidatePath("/cliente/pesos-maximos")
  return { success: true }
}
