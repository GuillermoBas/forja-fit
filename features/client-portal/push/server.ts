import { getCurrentPortalAccessToken, requirePortalAccount } from "@/lib/auth/portal-session"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { isClientPreview } from "@/lib/preview-mode"
import { getPreviewPortalPushSettingsData } from "@/features/client-portal/preview-data"

export type PortalPushPreferences = {
  passExpiryEnabled: boolean
  passAssignedEnabled: boolean
  sessionRemindersEnabled: boolean
}

export type PortalPushSettingsData = {
  vapidPublicKey: string | null
  preferences: PortalPushPreferences
}

const defaultPreferences: PortalPushPreferences = {
  passExpiryEnabled: true,
  passAssignedEnabled: true,
  sessionRemindersEnabled: true
}

export async function getPortalPushSettingsData(): Promise<PortalPushSettingsData> {
  if (await isClientPreview()) {
    return getPreviewPortalPushSettingsData()
  }

  const portalAccount = await requirePortalAccount()
  const accessToken = await getCurrentPortalAccessToken()

  if (!accessToken) {
    return {
      vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
      preferences: defaultPreferences
    }
  }

  try {
    const client = createServerInsforgeClient({ accessToken }) as any
    const result = await client.database
      .from("push_preferences")
      .select("*")
      .eq("client_portal_account_id", portalAccount.id)
      .maybeSingle()

    if (result.error || !result.data) {
      return {
        vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
        preferences: defaultPreferences
      }
    }

    return {
      vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
      preferences: {
        passExpiryEnabled: Boolean(result.data.pass_expiry_enabled),
        passAssignedEnabled: Boolean(result.data.pass_assigned_enabled),
        sessionRemindersEnabled: Boolean(result.data.session_reminders_enabled)
      }
    }
  } catch {
    return {
      vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
      preferences: defaultPreferences
    }
  }
}
