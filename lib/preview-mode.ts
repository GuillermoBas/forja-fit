import { cookies } from "next/headers"
import {
  isVisualPreviewEnvEnabled,
  parseVisualPreviewMode,
  visualPreviewCookieName,
  type VisualPreviewMode
} from "@/lib/preview-config"

export function isVisualPreviewEnabled() {
  return isVisualPreviewEnvEnabled()
}

export async function getVisualPreviewMode(): Promise<VisualPreviewMode | null> {
  if (!isVisualPreviewEnabled()) {
    return null
  }

  const store = await cookies()
  return parseVisualPreviewMode(store.get(visualPreviewCookieName)?.value)
}

export async function isStaffPreview() {
  return (await getVisualPreviewMode()) === "staff"
}

export async function isClientPreview() {
  return (await getVisualPreviewMode()) === "cliente"
}
