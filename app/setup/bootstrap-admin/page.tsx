import { redirect } from "next/navigation"
import { BootstrapAdminForm } from "@/features/auth/bootstrap-admin-form"
import { createServerInsforgeClient } from "@/lib/insforge/server"

async function canBootstrap() {
  try {
    const client = createServerInsforgeClient() as any
    const result = await client.database
      .from("profiles")
      .select("id", { count: "exact" })
      .eq("role", "admin")

    return (result.count ?? 0) === 0
  } catch {
    return true
  }
}

export default async function BootstrapAdminPage() {
  const enabled = await canBootstrap()

  if (!enabled) {
    redirect("/login")
  }

  return <BootstrapAdminForm />
}
