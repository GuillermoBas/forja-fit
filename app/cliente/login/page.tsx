import { redirect } from "next/navigation"
import { PortalLoginForm } from "@/features/client-portal/auth/portal-login-form"
import { getCurrentPortalAccount } from "@/lib/auth/portal-session"

export default async function ClientPortalLoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; reset?: string }> | { error?: string; reset?: string }
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const portalAccount = await getCurrentPortalAccount()

  if (portalAccount) {
    redirect("/cliente/dashboard")
  }

  return (
    <PortalLoginForm
      errorMessage={resolvedSearchParams?.error}
      resetStatus={resolvedSearchParams?.reset}
    />
  )
}
