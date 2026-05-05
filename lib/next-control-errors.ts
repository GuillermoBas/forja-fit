export function isNextControlError(error: unknown) {
  const digest =
    error && typeof error === "object" && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : ""
  const message = error instanceof Error ? error.message : ""

  return (
    digest === "DYNAMIC_SERVER_USAGE" ||
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND") ||
    message.includes("Dynamic server usage")
  )
}
