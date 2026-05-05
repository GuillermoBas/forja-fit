"use server"

import { createClient } from "@insforge/sdk"
import { revalidatePath } from "next/cache"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"
import { getSessionContext } from "@/lib/auth/session"
import { createServerInsforgeClient } from "@/lib/insforge/server"

export type ManualPushClientOption = {
  id: string
  label: string
}

export type ProfileColorActionState = {
  error?: string
  success?: string
}

export type ManualPushActionState = {
  error?: string
  success?: string
}

export type StaffActionState = {
  error?: string
  success?: string
}

export type BusinessSettingsActionState = {
  error?: string
  success?: string
}

export type StaffActivationResendActionState = {
  error?: string
  success?: string
}

function createBrowserStyleInsforgeClient() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY

  if (!baseUrl || !anonKey) {
    throw new Error("Faltan variables de entorno de InsForge para crear staff.")
  }

  return createClient({
    baseUrl,
    anonKey
  }) as any
}

export async function updateProfileCalendarColorAction(
  _prevState: ProfileColorActionState,
  formData: FormData
): Promise<ProfileColorActionState> {
  try {
    await invokeProtectedFunction("update_profile_calendar_color", {
      profileId: String(formData.get("profileId") ?? "").trim(),
      calendarColor: String(formData.get("calendarColor") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo guardar el color de agenda")
  }

  revalidatePath("/settings")
  revalidatePath("/agenda")
  return { success: "Color de agenda actualizado correctamente." }
}

export async function sendManualPushAction(
  _prevState: ManualPushActionState,
  formData: FormData
): Promise<ManualPushActionState> {
  const clientId = String(formData.get("clientId") ?? "").trim()
  const url = String(formData.get("url") ?? "").trim()
  const title = String(formData.get("title") ?? "").trim()
  const body = String(formData.get("body") ?? "").trim()

  if (!clientId || !title || !body || !url.startsWith("/")) {
    return {
      error: "Selecciona un cliente y completa titulo, mensaje y una ruta interna valida."
    }
  }

  try {
    const result = await invokeProtectedFunction("send_push_to_client", {
      clientId,
      eventType: "manual_note",
      dedupeKey: `manual_push:${clientId}:${Date.now()}`,
      title,
      body,
      url
    })

    if (result?.skipped) {
      return {
        success: "Push procesada como omitida. El cliente no tiene suscripciones activas o el portal aun no esta listo."
      }
    }
  } catch (error) {
    return toActionError(error, "No se pudo enviar la notificacion push manual")
  }

  revalidatePath("/settings")
  return { success: "Notificacion push enviada correctamente." }
}

export async function upsertStaffUserAction(
  _prevState: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  const fullName = String(formData.get("fullName") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const role = String(formData.get("role") ?? "trainer").trim()
  const profileId = String(formData.get("profileId") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!fullName) {
    return { error: "El nombre completo es obligatorio." }
  }

  if (!profileId && (!email || password.length < 6)) {
    return { error: "Para crear un usuario nuevo necesitas email y una clave temporal de al menos 6 caracteres." }
  }

  if (role !== "admin" && role !== "trainer") {
    return { error: "Selecciona un rol valido." }
  }

  try {
    if (!profileId) {
      const { profile, accessToken } = await getSessionContext()

      if (!profile || profile.role !== "admin" || !accessToken) {
        return { error: "No tienes permisos para gestionar staff." }
      }

      const adminClient = createServerInsforgeClient({ accessToken }) as any
      const existingProfile = await adminClient.database
        .from("profiles")
        .select("id")
        .eq("gym_id", profile.gymId)
        .eq("email", email)
        .maybeSingle()

      if (existingProfile.error) {
        return { error: existingProfile.error.message ?? "No se pudo validar el email del staff." }
      }

      if (existingProfile.data?.id) {
        return { error: "Ya existe un usuario staff con ese email." }
      }

      const signupClient = createBrowserStyleInsforgeClient()
      const signUp = await signupClient.auth.signUp({
        email,
        password,
        name: fullName
      })

      let authUserId = signUp.data?.user?.id ? String(signUp.data.user.id) : null

      if (!authUserId) {
        const existingAuthUser = await adminClient.database.rpc("app_find_auth_user_id_by_email", {
          p_actor_profile_id: profile.id,
          p_email: email
        })

        if (existingAuthUser.error || !existingAuthUser.data) {
          if (signUp.error?.message === "User already exists") {
            return { error: "El usuario ya existe en Auth, pero no se pudo recuperar para enlazarlo al perfil staff." }
          }

          return { error: signUp.error?.message ?? "No se pudo recuperar el usuario recien creado para enlazarlo al perfil staff." }
        }

        authUserId = String(existingAuthUser.data)
      }

      const profileInsert = await adminClient.database.from("profiles").insert([
        {
          gym_id: profile.gymId,
          auth_user_id: authUserId,
          full_name: fullName,
          email,
          role,
          is_active: formData.get("isActive") === "on"
        }
      ]).select("id").single()

      if (profileInsert.error || !profileInsert.data?.id) {
        return { error: profileInsert.error?.message ?? "No se pudo crear el perfil staff." }
      }

      const auditInsert = await adminClient.database.from("audit_logs").insert([
        {
          gym_id: profile.gymId,
          actor_profile_id: profile.id,
          entity_name: "profiles",
          entity_id: profileInsert.data.id,
          action: "create",
          diff: {
            full_name: fullName,
            email,
            role,
            is_active: formData.get("isActive") === "on"
          }
        }
      ])

      if (auditInsert.error) {
        return { error: auditInsert.error.message ?? "No se pudo registrar la auditoria del alta staff." }
      }

      revalidatePath("/settings")

      return {
        success: "Usuario staff creado. Ya puede activar su acceso con el codigo recibido por email."
      }
    }

    const result = await invokeProtectedFunction("create_staff_user", {
      profileId: profileId || undefined,
      fullName,
      email: email || undefined,
      password: password || undefined,
      role,
      isActive: formData.get("isActive") === "on"
    })

    revalidatePath("/settings")

    return {
      success: result?.mode === "create"
        ? "Usuario staff creado. Ya puede activar su acceso con el codigo recibido por email."
        : "Perfil staff actualizado correctamente."
    }
  } catch (error) {
    return toActionError(error, "No se pudo guardar el usuario staff")
  }
}

export async function resendStaffActivationAction(
  _prevState: StaffActivationResendActionState,
  formData: FormData
): Promise<StaffActivationResendActionState> {
  const profileId = String(formData.get("profileId") ?? "").trim()

  if (!profileId) {
    return { error: "Falta identificar el usuario staff." }
  }

  try {
    await invokeProtectedFunction("resend_staff_activation", { profileId })
  } catch (error) {
    return toActionError(error, "No se pudo reenviar el codigo de activacion")
  }

  revalidatePath("/settings")

  return {
    success: "Codigo de activacion reenviado correctamente."
  }
}

export async function updateBusinessSettingsAction(
  _prevState: BusinessSettingsActionState,
  formData: FormData
): Promise<BusinessSettingsActionState> {
  const businessName = String(formData.get("businessName") ?? "").trim()
  const reminderDaysDefault = Number(formData.get("reminderDaysDefault") ?? 7)
  const defaultVatRate = Number(formData.get("defaultVatRate") ?? 21)

  if (!businessName) {
    return { error: "El nombre del negocio es obligatorio." }
  }

  if (!Number.isInteger(reminderDaysDefault) || reminderDaysDefault < 0 || reminderDaysDefault > 30) {
    return { error: "El aviso por defecto debe estar entre 0 y 30 dias." }
  }

  if (!Number.isFinite(defaultVatRate) || defaultVatRate < 0) {
    return { error: "El IVA por defecto debe ser un numero valido." }
  }

  try {
    await invokeProtectedFunction("update_business_settings", {
      businessName,
      reminderDaysDefault,
      defaultVatRate
    })
  } catch (error) {
    return toActionError(error, "No se pudo guardar la configuracion del negocio")
  }

  revalidatePath("/settings")

  return {
    success: "Configuracion del negocio actualizada correctamente."
  }
}
