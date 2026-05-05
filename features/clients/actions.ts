"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { getCurrentAccessToken } from "@/lib/auth/session"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"
import { isStaffPreview } from "@/lib/preview-mode"
import { getTodayDateKeyInAppTimeZone } from "@/lib/timezone"
import { requireCurrentGym } from "@/lib/tenant"

export type ClientActionState = {
  error?: string
  fieldErrors?: Partial<Record<"firstName" | "lastName" | "email", string>>
  success?: boolean
  redirectTo?: string
}

type PassTypeScheduleMeta = {
  kind: "session" | "monthly"
  sessionCount: number | null
}

type SchedulePatternEntry = {
  weekday: number
  hour: string
  trainerProfileId: string
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

const schedulePatternSchema = z.array(z.object({
  weekday: z.number().int().min(1).max(7),
  hour: z.string().regex(/^([01]\d|2[0-3]):00$/),
  trainerProfileId: z.string().uuid()
})).max(30)

async function createAuthedDatabaseClient() {
  const accessToken = await getCurrentAccessToken()

  if (!accessToken) {
    throw new Error("La sesión ha caducado. Vuelve a iniciar sesión.")
  }

  const gym = await requireCurrentGym()
  return Object.assign(createServerInsforgeClient({ accessToken }) as any, { __gymId: gym.id })
}

function parseSchedulePattern(formData: FormData) {
  const rawValue = String(formData.get("schedulePattern") ?? "[]").trim() || "[]"

  try {
    const parsed = schedulePatternSchema.parse(JSON.parse(rawValue))
    const uniqueKeys = new Set<string>()

    for (const entry of parsed) {
      const key = `${entry.weekday}-${entry.hour}-${entry.trainerProfileId}`

      if (uniqueKeys.has(key)) {
        throw new Error("El patrón semanal no puede contener filas duplicadas.")
      }

      uniqueKeys.add(key)
    }

    return parsed
  } catch (error) {
    if (error instanceof Error && error.message === "El patrón semanal no puede contener filas duplicadas.") {
      throw error
    }

    throw new Error("El patrón semanal de agenda no es válido.")
  }
}

async function getPassTypeScheduleMeta(passTypeId: string): Promise<PassTypeScheduleMeta | null> {
  const client = await createAuthedDatabaseClient()
  const gymId = String(client.__gymId ?? "")
  const result = await client.database
    .from("pass_types")
    .select("kind,sessions_total")
    .eq("gym_id", gymId)
    .eq("id", passTypeId)
    .maybeSingle()

  if (result.error || !result.data) {
    return null
  }

  return {
    kind: result.data.kind === "monthly" ? "monthly" : "session",
    sessionCount:
      typeof result.data.sessions_total === "number"
        ? result.data.sessions_total
        : result.data.sessions_total === null
          ? null
          : Number(result.data.sessions_total)
  }
}

async function schedulePassSessionsIfNeeded({
  passId,
  passTypeId,
  startOn,
  schedulePattern,
  mode = "all"
}: {
  passId?: string | null
  passTypeId: string
  startOn: string
  schedulePattern: SchedulePatternEntry[]
  mode?: "all" | "pending"
}) {
  if (!passId || schedulePattern.length === 0) {
    return
  }

  const passType = await getPassTypeScheduleMeta(passTypeId)

  if (!passType || passType.kind !== "session" || !passType.sessionCount) {
    return
  }

  await invokeProtectedFunction("schedule_pass_sessions", {
    passId,
    startOn,
    mode,
    entries: schedulePattern
  })
}

function buildWarning(prefix: string, error: unknown) {
  return error instanceof Error ? `${prefix}: ${error.message}` : prefix
}

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
  const passTypeId = String(formData.get("passTypeId") ?? "").trim()
  const contractedOn = String(formData.get("contractedOn") ?? "").trim()

  if (!clientId || holderClientIds.length < 1) {
    return { error: "Debes indicar al menos un titular para el bono." }
  }

  let schedulePattern: SchedulePatternEntry[] = []

  try {
    schedulePattern = parseSchedulePattern(formData)
  } catch (error) {
    return toActionError(error, "No se pudo validar el patrón semanal")
  }

  let result: { passId?: string | null; saleId?: string | null } | null = null
  const warnings: string[] = []

  try {
    result = await invokeProtectedFunction("create_pass", {
      passTypeId,
      holderClientIds,
      purchasedByClientId: String(formData.get("purchasedByClientId") ?? "").trim() || clientId,
      passSubType: String(formData.get("passSubType") ?? "individual").trim() || "individual",
      paymentMethod: String(formData.get("paymentMethod") ?? "").trim(),
      priceGross: String(formData.get("priceGross") ?? "").trim(),
      contractedOn,
      notes: String(formData.get("notes") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo crear el bono")
  }

  if (result?.passId) {
    try {
      await schedulePassSessionsIfNeeded({
        passId: result.passId,
        passTypeId,
        startOn: contractedOn,
        schedulePattern
      })
    } catch (error) {
      warnings.push(
        buildWarning(
          "El bono se creó, pero no se pudieron agendar automáticamente las sesiones",
          error
        )
      )
    }
  }

  if (result?.saleId) {
    try {
      await invokeProtectedFunction("generate_ticket_pdf", {
        saleId: result.saleId
      })
    } catch (error) {
      warnings.push(
        buildWarning("El bono se creó, pero el ticket de la venta no se pudo generar", error)
      )
    }
  }

  revalidatePath("/passes")
  revalidatePath("/sales")
  revalidatePath("/reports")
  revalidatePath("/dashboard")
  revalidatePath("/agenda")
  revalidatePath(`/clients/${clientId}`)

  if (warnings.length) {
    return {
      success: true,
      error: warnings.join(" ")
    }
  }

  return { success: true }
}

export async function deleteClientAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const clientId = String(formData.get("clientId") ?? "").trim()
  const confirmationText = String(formData.get("confirmationText") ?? "").trim()

  if (!clientId) {
    return { error: "No se ha encontrado el cliente que quieres borrar." }
  }

  if (confirmationText !== "CONFIRMO") {
    return { error: 'Escribe "CONFIRMO" para confirmar el borrado.' }
  }

  try {
    if (await isStaffPreview()) {
      redirect("/clients")
    }

    const accessToken = await getCurrentAccessToken()
    const gym = await requireCurrentGym()
    const client = accessToken ? (createServerInsforgeClient({ accessToken }) as any) : null

    if (!client) {
      return { error: "La sesión ha caducado. Vuelve a iniciar sesión." }
    }

    const [passesResult, salesResult, notificationsResult, calendarResult] = await Promise.all([
      Promise.all([
        client.database.from("pass_holders").select("id", { count: "exact" }).eq("gym_id", gym.id).eq("client_id", clientId),
        client.database.from("passes").select("id", { count: "exact" }).eq("gym_id", gym.id).eq("purchased_by_client_id", clientId)
      ]),
      client.database
        .from("sales")
        .select("id", { count: "exact" })
        .eq("gym_id", gym.id)
        .eq("client_id", clientId),
      client.database
        .from("notification_log")
        .select("id", { count: "exact" })
        .eq("gym_id", gym.id)
        .eq("client_id", clientId),
      client.database
        .from("calendar_sessions")
        .select("id", { count: "exact" })
        .eq("gym_id", gym.id)
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
  redirect("/clients")
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
  const passTypeId = String(formData.get("passTypeId") ?? "").trim()
  const contractedOn = String(formData.get("contractedOn") ?? "").trim()
  let schedulePattern: SchedulePatternEntry[] = []

  try {
    schedulePattern = parseSchedulePattern(formData)
  } catch (error) {
    return toActionError(error, "No se pudo validar el patrón semanal")
  }

  let result: { passId?: string | null; saleId?: string | null } | null = null
  const warnings: string[] = []

  try {
    result = await invokeProtectedFunction("renew_pass", {
      passId: String(formData.get("passId") ?? ""),
      passTypeId,
      paymentMethod: String(formData.get("paymentMethod") ?? ""),
      priceGross: String(formData.get("priceGross") ?? "").trim(),
      contractedOn,
      notes: String(formData.get("notes") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo renovar el bono")
  }

  if (result?.passId) {
    try {
      await schedulePassSessionsIfNeeded({
        passId: result.passId,
        passTypeId,
        startOn: contractedOn,
        schedulePattern
      })
    } catch (error) {
      warnings.push(
        buildWarning(
          "El bono se renovó, pero no se pudieron agendar automáticamente las sesiones",
          error
        )
      )
    }
  }

  if (result?.saleId) {
    try {
      await invokeProtectedFunction("generate_ticket_pdf", {
        saleId: result.saleId
      })
    } catch (error) {
      warnings.push(
        buildWarning("El bono se renovó, pero el ticket de la venta no se pudo generar", error)
      )
    }
  }

  revalidatePath("/passes")
  revalidatePath("/sales")
  revalidatePath("/reports")
  revalidatePath("/dashboard")
  revalidatePath("/agenda")
  revalidatePath("/notifications")
  revalidatePath(`/clients/${clientId}`)

  if (warnings.length) {
    return {
      success: true,
      error: warnings.join(" ")
    }
  }

  return { success: true }
}

export async function scheduleExistingPassSessionsAction(
  _prevState: ClientActionState,
  formData: FormData
): Promise<ClientActionState> {
  const clientId = String(formData.get("clientId") ?? "").trim()
  const passId = String(formData.get("passId") ?? "").trim()
  const passTypeId = String(formData.get("passTypeId") ?? "").trim()
  const startOn = getTodayDateKeyInAppTimeZone()
  let schedulePattern: SchedulePatternEntry[] = []

  if (!clientId || !passId || !passTypeId) {
    return { error: "No se ha encontrado el bono que quieres agendar." }
  }

  try {
    schedulePattern = parseSchedulePattern(formData)
  } catch (error) {
    return toActionError(error, "No se pudo validar el patrón semanal")
  }

  try {
    await schedulePassSessionsIfNeeded({
      passId,
      passTypeId,
      startOn,
      schedulePattern,
      mode: "pending"
    })
  } catch (error) {
    return toActionError(error, "No se pudieron agendar las sesiones pendientes")
  }

  revalidatePath("/passes")
  revalidatePath("/agenda")
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
