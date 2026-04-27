export type VisualPreviewMode = "staff" | "cliente"

export const visualPreviewCookieName = "forjafit_visual_preview"
export const visualPreviewSearchParam = "preview"

export function isVisualPreviewEnvEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.FORJAFIT_VISUAL_PREVIEW === "1"
}

export function parseVisualPreviewMode(value: string | null | undefined): VisualPreviewMode | null {
  return value === "staff" || value === "cliente" ? value : null
}
