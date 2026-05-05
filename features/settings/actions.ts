"use server"

import { createClient } from "@insforge/sdk"
import { revalidatePath } from "next/cache"
import sharp from "sharp"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"
import { getSessionContext } from "@/lib/auth/session"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import type { BrandAssetVariant } from "@/types/domain"

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

type GeneratedBrandAsset = {
  variant: BrandAssetVariant
  filename: string
  contentType: "image/png" | "image/webp"
  width: number
  height: number
  sizeBytes: number
  base64: string
}

type GeneratedBrandingPayload = {
  version: string
  assets: GeneratedBrandAsset[]
}

const BRAND_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function isPngBuffer(buffer: Buffer) {
  return PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)
}

function makeBrandVersion() {
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 12)
  return `${Date.now().toString(36)}-${randomPart}`
}

async function renderSquarePng(buffer: Buffer, size: number) {
  return sharp(buffer)
    .rotate()
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function renderSquareWebp(buffer: Buffer, size: number) {
  return sharp(buffer)
    .rotate()
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .webp({ quality: 90 })
    .toBuffer()
}

async function renderMaskablePng(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .resize(384, 384, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .extend({
      top: 64,
      right: 64,
      bottom: 64,
      left: 64,
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

function toGeneratedAsset(
  variant: BrandAssetVariant,
  filename: string,
  contentType: "image/png" | "image/webp",
  width: number,
  height: number,
  bytes: Buffer
): GeneratedBrandAsset {
  return {
    variant,
    filename,
    contentType,
    width,
    height,
    sizeBytes: bytes.byteLength,
    base64: bytes.toString("base64")
  }
}

async function generateBrandingPayload(value: FormDataEntryValue | null): Promise<GeneratedBrandingPayload | null> {
  if (!(value instanceof File) || value.size === 0) {
    return null
  }

  if (value.size > BRAND_IMAGE_MAX_BYTES) {
    throw new Error("La imagen del negocio no puede superar 10 MB.")
  }

  if (value.type && value.type !== "image/png") {
    throw new Error("La imagen del negocio debe ser un PNG cuadrado.")
  }

  const buffer = Buffer.from(await value.arrayBuffer())

  if (!isPngBuffer(buffer)) {
    throw new Error("La imagen del negocio debe ser un PNG real.")
  }

  const metadata = await sharp(buffer).metadata()
  const width = Number(metadata.width ?? 0)
  const height = Number(metadata.height ?? 0)

  if (metadata.format !== "png" || !width || !height) {
    throw new Error("No se pudo leer el PNG del negocio.")
  }

  if (width !== height) {
    throw new Error("La imagen del negocio debe ser cuadrada.")
  }

  if (width < 180) {
    throw new Error("La imagen del negocio debe medir al menos 180x180 px.")
  }

  const sourceSize = Math.min(Math.max(width, 512), 1024)
  const source = await renderSquarePng(buffer, sourceSize)
  const logoPng = await renderSquarePng(buffer, 512)
  const logoWebp = await renderSquareWebp(buffer, 512)
  const favicon16 = await renderSquarePng(buffer, 16)
  const favicon32 = await renderSquarePng(buffer, 32)
  const apple = await renderSquarePng(buffer, 180)
  const icon192 = await renderSquarePng(buffer, 192)
  const icon512 = await renderSquarePng(buffer, 512)
  const maskable = await renderMaskablePng(buffer)
  const badge = await renderSquarePng(buffer, 96)

  return {
    version: makeBrandVersion(),
    assets: [
      toGeneratedAsset("source", "source.png", "image/png", sourceSize, sourceSize, source),
      toGeneratedAsset("logo-512-png", "logo-512.png", "image/png", 512, 512, logoPng),
      toGeneratedAsset("logo-512-webp", "logo-512.webp", "image/webp", 512, 512, logoWebp),
      toGeneratedAsset("favicon-16", "favicon-16.png", "image/png", 16, 16, favicon16),
      toGeneratedAsset("favicon-32", "favicon-32.png", "image/png", 32, 32, favicon32),
      toGeneratedAsset("apple-touch-icon-180", "apple-touch-icon-180.png", "image/png", 180, 180, apple),
      toGeneratedAsset("icon-192", "icon-192.png", "image/png", 192, 192, icon192),
      toGeneratedAsset("icon-512", "icon-512.png", "image/png", 512, 512, icon512),
      toGeneratedAsset("maskable-icon-512", "maskable-icon-512.png", "image/png", 512, 512, maskable),
      toGeneratedAsset("badge-96", "badge-96.png", "image/png", 96, 96, badge)
    ]
  }
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

  let brandingPayload: GeneratedBrandingPayload | null = null

  try {
    brandingPayload = await generateBrandingPayload(formData.get("brandImage"))
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo procesar la imagen del negocio."
    }
  }

  try {
    await invokeProtectedFunction("update_business_settings", {
      businessName,
      reminderDaysDefault,
      defaultVatRate,
      brandAssetVersion: brandingPayload?.version,
      brandAssets: brandingPayload?.assets
    })
  } catch (error) {
    return toActionError(error, "No se pudo guardar la configuracion del negocio")
  }

  revalidatePath("/settings")
  revalidatePath("/")
  revalidatePath("/login")
  revalidatePath("/cliente/login")
  revalidatePath("/manifest.webmanifest")

  return {
    success: brandingPayload
      ? "Configuracion e imagen del negocio actualizadas correctamente."
      : "Configuracion del negocio actualizada correctamente."
  }
}
