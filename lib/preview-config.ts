export type VisualPreviewMode = "staff" | "cliente"

export const visualPreviewCookieName = "trainium_visual_preview"
export const visualPreviewSearchParam = "preview"

export function isVisualPreviewEnvEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.TRAINIUM_VISUAL_PREVIEW === "1"
}

export function parseVisualPreviewMode(value: string | null | undefined): VisualPreviewMode | null {
  return value === "staff" || value === "cliente" ? value : null
}
