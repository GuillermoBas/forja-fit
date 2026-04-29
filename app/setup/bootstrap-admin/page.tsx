import { redirect } from "next/navigation"
import { BootstrapAdminForm } from "@/features/auth/bootstrap-admin-form"
import { canBootstrapFirstAdmin } from "@/features/auth/server"

export default async function BootstrapAdminPage() {
  const enabled = await canBootstrapFirstAdmin()

  if (!enabled) {
    redirect("/login")
  }

  return <BootstrapAdminForm />
}
