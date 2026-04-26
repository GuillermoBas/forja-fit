import { redirect } from "next/navigation"
import { PortalLoginForm } from "@/features/client-portal/auth/portal-login-form"
import { getCurrentPortalAccount } from "@/lib/auth/portal-session"

export default async function ClientPortalLoginPage({
  searchParams
}: {
  searchParams?: { error?: string; reset?: string }
}) {
  const portalAccount = await getCurrentPortalAccount()

  if (portalAccount) {
    redirect("/cliente/dashboard")
  }

  return (
    <PortalLoginForm
      errorMessage={searchParams?.error}
      resetStatus={searchParams?.reset}
    />
  )
}
