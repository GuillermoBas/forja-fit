"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentAccessToken } from "@/lib/auth/session"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"
import { isStaffPreview } from "@/lib/preview-mode"

export type ClientActionState = {
  error?: string
  fieldErrors?: Partial<Record<"firstName" | "lastName" | "email", string>>
  success?: boolean
  redirectTo?: string
}

const clientFormSchema = z.object({
  firstName: z.string().trim().min(1, "El nombre es obligatorio."),
  lastName: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => value ?? "")
    .refine((value) => value === "" || z.string().email().safeParse(value).success, {
      message: "El email no tiene un formato valido."
    })
})

export async function upsertClientAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const id = String(formData.get("id") ?? "").trim() || undefined
  const firstName = String(formData.get("firstName") ?? "").trim()
  const lastName = String(formData.get("lastName") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()

  const parsed = clientFormSchema.safeParse({
    firstName,
    lastName,
    email
  })

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors

    return {
      error: "Revisa el formulario antes de continuar.",
      fieldErrors: {
        firstName: fieldErrors.firstName?.[0],
        lastName: fieldErrors.lastName?.[0],
        email: fieldErrors.email?.[0]
      }
    }
  }

  try {
    const result = await invokeProtectedFunction("upsert_client", {
      id,
      firstName,
      lastName,
      email,
      phone: String(formData.get("phone") ?? "").trim(),
      taxId: String(formData.get("taxId") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
      isActive: formData.get("isActive") === "on"
    })

    const clientId = String(result?.clientId ?? id ?? "").trim()

    revalidatePath("/clients")
    if (clientId) {
      revalidatePath(`/clients/${clientId}`)
    }

    return {
      success: true,
      redirectTo: clientId ? `/clients/${clientId}` : "/clients"
    }
  } catch (error) {
    return toActionError(error, "No se pudo guardar el cliente")
  }
}

export async function createPassAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const holderClientIds = formData
    .getAll("holderClientIds")
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
  const clientId = holderClientIds[0] ?? String(formData.get("holder1ClientId") ?? "")

  if (!clientId || holderClientIds.length < 1) {
    return { error: "Debes indicar al menos un titular para el bono." }
  }

  try {
    await invokeProtectedFunction("create_pass", {
      passTypeId: String(formData.get("passTypeId") ?? ""),
      holderClientIds,
      purchasedByClientId: String(formData.get("purchasedByClientId") ?? "").trim() || clientId,
      paymentMethod: String(formData.get("paymentMethod") ?? "").trim(),
      priceGross: String(formData.get("priceGross") ?? "").trim(),
      contractedOn: String(formData.get("contractedOn") ?? ""),
      notes: String(formData.get("notes") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo crear el bono")
  }

  revalidatePath("/passes")
  revalidatePath("/sales")
  revalidatePath("/reports")
  revalidatePath("/dashboard")
  revalidatePath(`/clients/${clientId}`)
  return { success: true }
}

export async function deleteClientAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const clientId = String(formData.get("clientId") ?? "").trim()
  const confirmationText = String(formData.get("confirmationText") ?? "").trim()

  if (!clientId) {
    return { error: "No se ha encontrado el cliente a borrar." }
  }

  if (confirmationText !== "CONFIRMO") {
    return { error: 'Escribe "CONFIRMO" para confirmar el borrado.' }
  }

  try {
    if (await isStaffPreview()) {
      return { success: true, redirectTo: "/clients" }
    }

    const accessToken = await getCurrentAccessToken()
    const client = accessToken ? (createServerInsforgeClient({ accessToken }) as any) : null

    if (!client) {
      return { error: "La sesión ha caducado. Vuelve a iniciar sesión." }
    }

    const [passesResult, salesResult, notificationsResult, calendarResult] = await Promise.all([
      Promise.all([
        client.database.from("pass_holders").select("id", { count: "exact" }).eq("client_id", clientId),
        client.database.from("passes").select("id", { count: "exact" }).eq("purchased_by_client_id", clientId)
      ]),
      client.database
        .from("sales")
        .select("id", { count: "exact" })
        .eq("client_id", clientId),
      client.database
        .from("notification_log")
        .select("id", { count: "exact" })
        .eq("client_id", clientId),
      client.database
        .from("calendar_sessions")
        .select("id", { count: "exact" })
        .or(`client_1_id.eq.${clientId},client_2_id.eq.${clientId}`)
    ])

    const passRelationCount = (passesResult[0].count ?? 0) + (passesResult[1].count ?? 0)

    if (passRelationCount > 0) {
      return { error: "No se puede borrar el cliente porque tiene bonos asociados." }
    }

    if ((salesResult.count ?? 0) > 0) {
      return { error: "No se puede borrar el cliente porque tiene ventas asociadas." }
    }

    if ((notificationsResult.count ?? 0) > 0) {
      return { error: "No se puede borrar el cliente porque tiene notificaciones asociadas." }
    }

    if ((calendarResult.count ?? 0) > 0) {
      return { error: "No se puede borrar el cliente porque tiene sesiones de agenda asociadas." }
    }

    await invokeProtectedFunction("delete_client", {
      clientId
    })
  } catch (error) {
    return toActionError(error, "No se pudo borrar el cliente")
  }

  revalidatePath("/clients")
  return {
    success: true,
    redirectTo: "/clients"
  }
}

export async function consumeSessionAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const clientId = String(formData.get("clientId") ?? "")
  try {
    await invokeProtectedFunction("consume_session", {
      passId: String(formData.get("passId") ?? ""),
      clientId,
      consumedAt: String(formData.get("consumedAt") ?? ""),
      notes: String(formData.get("notes") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo consumir la sesión")
  }

  revalidatePath("/passes")
  revalidatePath(`/clients/${clientId}`)
  return { success: true }
}

export async function pausePassAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const clientId = String(formData.get("clientId") ?? "")
  try {
    await invokeProtectedFunction("pause_pass", {
      passId: String(formData.get("passId") ?? ""),
      startsOn: String(formData.get("startsOn") ?? ""),
      endsOn: String(formData.get("endsOn") ?? ""),
      reason: String(formData.get("reason") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo pausar el bono")
  }

  revalidatePath("/passes")
  revalidatePath(`/clients/${clientId}`)
  return { success: true }
}

export async function renewPassAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const clientId = String(formData.get("clientId") ?? "")
  try {
    await invokeProtectedFunction("renew_pass", {
      passId: String(formData.get("passId") ?? ""),
      passTypeId: String(formData.get("passTypeId") ?? ""),
      paymentMethod: String(formData.get("paymentMethod") ?? ""),
      priceGross: String(formData.get("priceGross") ?? "").trim(),
      contractedOn: String(formData.get("contractedOn") ?? ""),
      notes: String(formData.get("notes") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo renovar el bono")
  }

  revalidatePath("/passes")
  revalidatePath("/sales")
  revalidatePath("/reports")
  revalidatePath("/dashboard")
  revalidatePath("/notifications")
  revalidatePath(`/clients/${clientId}`)
  return { success: true }
}

export async function unlinkClientPortalAccountAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const clientId = String(formData.get("clientId") ?? "").trim()

  if (!clientId) {
    return { error: "No se ha encontrado el cliente del portal." }
  }

  try {
    await invokeProtectedFunction("unlink_client_portal_account", {
      clientId
    })
  } catch (error) {
    return toActionError(error, "No se pudo desvincular la cuenta del portal")
  }

  revalidatePath("/clients")
  revalidatePath(`/clients/${clientId}`)
  return { success: true }
}

export async function setClientPortalAccountStatusAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const clientId = String(formData.get("clientId") ?? "").trim()
  const status = String(formData.get("status") ?? "").trim()

  if (!clientId) {
    return { error: "No se ha encontrado el cliente del portal." }
  }

  if (status !== "claimed" && status !== "disabled") {
    return { error: "El estado solicitado no es valido." }
  }

  try {
    await invokeProtectedFunction("set_client_portal_account_status", {
      clientId,
      status
    })
  } catch (error) {
    return toActionError(
      error,
      status === "claimed"
        ? "No se pudo reactivar la cuenta del portal"
        : "No se pudo desactivar la cuenta del portal"
    )
  }

  revalidatePath("/clients")
  revalidatePath(`/clients/${clientId}`)
  return { success: true }
}
