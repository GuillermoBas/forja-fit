import { redirect } from "next/navigation"
import { PortalRegisterForm } from "@/features/client-portal/auth/portal-register-form"
import { getCurrentPortalAccount } from "@/lib/auth/portal-session"

export default async function ClientPortalRegisterPage() {
  const portalAccount = await getCurrentPortalAccount()

  if (portalAccount) {
    redirect("/cliente/dashboard")
  }

  return <PortalRegisterForm />
}
