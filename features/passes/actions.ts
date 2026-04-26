"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"

export type PassActionState = {
  error?: string
  success?: boolean
  redirectTo?: string
}

const passTypeSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio."),
  kind: z.enum(["session", "monthly"]),
  sessionsTotal: z.number().int().min(1).max(30).nullable(),
  priceGross: z.number().nonnegative(),
  vatRate: z.number().nonnegative(),
  sortOrder: z.number().int().nonnegative()
})

const passEditSchema = z.object({
  passId: z.string().uuid(),
  passTypeId: z.string().uuid(),
  holderClientIds: z.array(z.string().uuid()).min(1).max(5),
  purchasedByClientId: z.string().uuid().optional(),
  contractedOn: z.string().min(1),
  status: z.enum(["active", "paused", "out_of_sessions", "expired", "cancelled"]),
  sessionsLeft: z.number().int().min(0).nullable(),
  notes: z.string().optional()
})

function parseHolderClientIds(formData: FormData) {
  return formData
    .getAll("holderClientIds")
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
}

export async function upsertPassTypeAction(
  _prevState: PassActionState,
  formData: FormData
): Promise<PassActionState> {
  const kind = String(formData.get("kind") ?? "session") === "monthly" ? "monthly" : "session"
  const sessionsValue = String(formData.get("sessionsTotal") ?? "").trim()
  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    kind,
    sessionsTotal: kind === "session" ? Number(sessionsValue) : null,
    priceGross: Number(formData.get("priceGross") ?? 0),
    vatRate: Number(formData.get("vatRate") ?? 0),
    sortOrder: Number(formData.get("sortOrder") ?? 0)
  }

  const parsed = passTypeSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del tipo de bono." }
  }

  try {
    await invokeProtectedFunction("upsert_pass_type", {
      id: String(formData.get("id") ?? "").trim() || undefined,
      ...parsed.data,
      sharedAllowed: formData.get("sharedAllowed") === "on",
      isActive: formData.get("isActive") === "on"
    })
  } catch (error) {
    return toActionError(error, "No se pudo guardar el tipo de bono")
  }

  revalidatePath("/passes")
  return { success: true }
}

export async function updatePassAction(
  _prevState: PassActionState,
  formData: FormData
): Promise<PassActionState> {
  const holderClientIds = parseHolderClientIds(formData)
  const sessionsValue = String(formData.get("sessionsLeft") ?? "").trim()
  const payload = {
    passId: String(formData.get("passId") ?? "").trim(),
    passTypeId: String(formData.get("passTypeId") ?? "").trim(),
    holderClientIds,
    purchasedByClientId: String(formData.get("purchasedByClientId") ?? "").trim() || undefined,
    contractedOn: String(formData.get("contractedOn") ?? "").trim(),
    status: String(formData.get("status") ?? "active").trim(),
    sessionsLeft: sessionsValue ? Number(sessionsValue) : null,
    notes: String(formData.get("notes") ?? "").trim()
  }

  const parsed = passEditSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del bono." }
  }

  try {
    await invokeProtectedFunction("update_pass", parsed.data)
  } catch (error) {
    return toActionError(error, "No se pudo actualizar el bono")
  }

  revalidatePath("/passes")
  revalidatePath(`/passes/${parsed.data.passId}/edit`)
  for (const clientId of parsed.data.holderClientIds) {
    revalidatePath(`/clients/${clientId}`)
  }

  return {
    success: true,
    redirectTo: `/passes/${parsed.data.passId}/edit`
  }
}

export async function deletePassAction(
  _prevState: PassActionState,
  formData: FormData
): Promise<PassActionState> {
  const passId = String(formData.get("passId") ?? "").trim()
  const confirmationText = String(formData.get("confirmationText") ?? "").trim()

  if (!passId) {
    return { error: "No se ha encontrado el bono a borrar." }
  }

  if (confirmationText !== "CONFIRMO") {
    return { error: 'Escribe "CONFIRMO" para confirmar el borrado.' }
  }

  try {
    await invokeProtectedFunction("delete_pass", { passId })
  } catch (error) {
    return toActionError(error, "No se pudo borrar el bono")
  }

  revalidatePath("/passes")
  revalidatePath("/clients")
  return {
    success: true,
    redirectTo: "/passes"
  }
}
