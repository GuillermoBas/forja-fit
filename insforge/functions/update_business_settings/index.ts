// @ts-nocheck
import { createClient } from "npm:@insforge/sdk"

const BASE_URL = Deno.env.get("INSFORGE_URL") ?? Deno.env.get("NEXT_PUBLIC_INSFORGE_URL") ?? "https://4nc39nmu.eu-central.insforge.app"
const BRANDING_BUCKET = "gym-branding"

const ALLOWED_BRAND_ASSETS = new Map([
  ["source", { filename: "source.png", contentType: "image/png", width: 1024, height: 1024 }],
  ["logo-512-png", { filename: "logo-512.png", contentType: "image/png", width: 512, height: 512 }],
  ["logo-512-webp", { filename: "logo-512.webp", contentType: "image/webp", width: 512, height: 512 }],
  ["favicon-16", { filename: "favicon-16.png", contentType: "image/png", width: 16, height: 16 }],
  ["favicon-32", { filename: "favicon-32.png", contentType: "image/png", width: 32, height: 32 }],
  ["apple-touch-icon-180", { filename: "apple-touch-icon-180.png", contentType: "image/png", width: 180, height: 180 }],
  ["icon-192", { filename: "icon-192.png", contentType: "image/png", width: 192, height: 192 }],
  ["icon-512", { filename: "icon-512.png", contentType: "image/png", width: 512, height: 512 }],
  ["maskable-icon-512", { filename: "maskable-icon-512.png", contentType: "image/png", width: 512, height: 512 }],
  ["badge-96", { filename: "badge-96.png", contentType: "image/png", width: 96, height: 96 }]
])

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

async function getActor(client: any, gymId: string) {
  const authResult = await client.auth.getCurrentUser()
  if (authResult.error || !authResult.data?.user) {
    return { error: json({ code: "UNAUTHORIZED", message: "Sesion no valida" }, 401) }
  }

  const profileResult = await client.database
    .from("profiles")
    .select("*")
    .eq("auth_user_id", authResult.data.user.id)
    .eq("gym_id", gymId)
    .maybeSingle()

  if (profileResult.error || !profileResult.data) {
    return { error: json({ code: "PROFILE_REQUIRED", message: "Perfil no encontrado" }, 403) }
  }

  if (profileResult.data.role !== "admin") {
    return { error: json({ code: "FORBIDDEN", message: "Solo admin puede gestionar la configuracion del negocio" }, 403) }
  }

  return { profile: profileResult.data }
}

function isSafeVersion(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{5,80}$/.test(value)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

async function uploadBrandAssets(client: any, gymId: string, version: string, assets: any[]) {
  if (!Array.isArray(assets) || assets.length === 0) {
    return null
  }

  if (!isSafeVersion(version)) {
    return { error: json({ code: "INVALID_INPUT", message: "Version de imagen no valida" }, 400) }
  }

  const uploadedAssets: Record<string, unknown> = {}
  const seenVariants = new Set<string>()

  for (const asset of assets) {
    const variant = String(asset?.variant ?? "")
    const expected = ALLOWED_BRAND_ASSETS.get(variant)

    if (!expected || seenVariants.has(variant)) {
      return { error: json({ code: "INVALID_INPUT", message: "Variante de imagen no valida" }, 400) }
    }

    seenVariants.add(variant)

    const filename = String(asset?.filename ?? "")
    const contentType = String(asset?.contentType ?? "")
    const base64 = String(asset?.base64 ?? "")
    const width = Number(asset?.width ?? expected.width)
    const height = Number(asset?.height ?? expected.height)

    if (
      filename !== expected.filename ||
      contentType !== expected.contentType ||
      !base64 ||
      width <= 0 ||
      height <= 0
    ) {
      return { error: json({ code: "INVALID_INPUT", message: "La imagen del negocio no es valida" }, 400) }
    }

    let bytes: Uint8Array
    try {
      bytes = base64ToBytes(base64)
    } catch {
      return { error: json({ code: "INVALID_INPUT", message: "La imagen del negocio no se pudo decodificar" }, 400) }
    }

    if (!bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) {
      return { error: json({ code: "INVALID_INPUT", message: "Una variante de imagen supera el tamano permitido" }, 400) }
    }

    const key = `gyms/${gymId}/branding/${version}/${filename}`
    const file = new File([bytes], filename, { type: contentType })
    const uploadResult = await client.storage.from(BRANDING_BUCKET).upload(key, file)

    if (uploadResult.error || !uploadResult.data) {
      return {
        error: json(
          { code: "STORAGE_ERROR", message: uploadResult.error?.message ?? "No se pudo subir la imagen del negocio" },
          400
        )
      }
    }

    uploadedAssets[variant] = {
      key: uploadResult.data.key,
      url: uploadResult.data.url,
      contentType,
      width,
      height,
      sizeBytes: bytes.byteLength
    }
  }

  return { assets: uploadedAssets }
}

export default async function(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return json({ code: "UNAUTHORIZED", message: "Falta token" }, 401)
    }

    const body = await request.json()
    const gymId = String(body?.gymId ?? "")
    const businessName = String(body?.businessName ?? "").trim()
    const reminderDaysDefault = Number(body?.reminderDaysDefault ?? 7)
    const defaultVatRate = Number(body?.defaultVatRate ?? 21)
    const brandAssetVersion = body?.brandAssetVersion ? String(body.brandAssetVersion) : ""
    const brandAssets = Array.isArray(body?.brandAssets) ? body.brandAssets : []

    if (!businessName) {
      return json({ code: "INVALID_INPUT", message: "El nombre del negocio es obligatorio" }, 400)
    }

    if (!Number.isInteger(reminderDaysDefault) || reminderDaysDefault < 0 || reminderDaysDefault > 30) {
      return json({ code: "INVALID_INPUT", message: "El aviso por defecto debe estar entre 0 y 30 dias" }, 400)
    }

    if (!Number.isFinite(defaultVatRate) || defaultVatRate < 0) {
      return json({ code: "INVALID_INPUT", message: "El IVA por defecto debe ser valido" }, 400)
    }

    const client = createClient({
      baseUrl: BASE_URL,
      edgeFunctionToken: token
    })

    const actor = await getActor(client, gymId)
    if (actor.error) {
      return actor.error
    }

    const currentResult = await client.database.from("settings").select("*").eq("gym_id", gymId).limit(1).maybeSingle()
    if (currentResult.error || !currentResult.data) {
      return json({ code: "DB_ERROR", message: "No se pudo cargar la configuracion del negocio" }, 400)
    }

    const uploadedBrandAssets = brandAssets.length
      ? await uploadBrandAssets(client, gymId, brandAssetVersion, brandAssets)
      : null

    if (uploadedBrandAssets?.error) {
      return uploadedBrandAssets.error
    }

    const updatePayload: Record<string, unknown> = {
      business_name: businessName,
      reminder_days_default: reminderDaysDefault,
      default_vat_rate: defaultVatRate,
      updated_at: new Date().toISOString()
    }

    if (uploadedBrandAssets?.assets) {
      updatePayload.brand_asset_version = brandAssetVersion
      updatePayload.brand_assets = uploadedBrandAssets.assets
    }

    const updateResult = await client.database
      .from("settings")
      .update(updatePayload)
      .eq("id", currentResult.data.id)
      .eq("gym_id", gymId)
      .select("id")
      .single()

    if (updateResult.error || !updateResult.data) {
      return json({ code: "DB_ERROR", message: updateResult.error?.message ?? "No se pudo guardar la configuracion del negocio" }, 400)
    }

    const auditDiff: Record<string, unknown> = {
      business_name: businessName,
      reminder_days_default: reminderDaysDefault,
      default_vat_rate: defaultVatRate
    }

    if (uploadedBrandAssets?.assets) {
      auditDiff.brand_asset_version = brandAssetVersion
      auditDiff.brand_assets = Object.keys(uploadedBrandAssets.assets)
    }

    const auditInsert = await client.database.from("audit_logs").insert([
      {
        gym_id: gymId,
        actor_profile_id: actor.profile.id,
        entity_name: "settings",
        entity_id: currentResult.data.id,
        action: "update",
        diff: auditDiff
      }
    ])

    if (auditInsert.error) {
      return json({ code: "DB_ERROR", message: auditInsert.error.message }, 400)
    }

    return json({
      ok: true,
      settingsId: currentResult.data.id,
      brandAssetVersion: uploadedBrandAssets?.assets ? brandAssetVersion : null
    })
  } catch (error) {
    return json(
      { code: "UNEXPECTED", message: error instanceof Error ? error.message : "Error interno" },
      500
    )
  }
}
