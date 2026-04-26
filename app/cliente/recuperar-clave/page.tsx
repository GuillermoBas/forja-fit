import { redirect } from "next/navigation"
import { PortalResetPasswordForm } from "@/features/client-portal/auth/portal-reset-password-form"
import { getCurrentPortalAccount } from "@/lib/auth/portal-session"

export default async function ClientPortalResetPasswordPage() {
  const portalAccount = await getCurrentPortalAccount()

  if (portalAccount) {
    redirect("/cliente/dashboard")
  }

  return <PortalResetPasswordForm />
}
