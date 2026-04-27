import { redirect } from "next/navigation"
import { LoginForm } from "@/features/auth/login-form"
import { getCurrentAuthUser } from "@/lib/auth/session"

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ insforge_status?: string; error?: string }> | { insforge_status?: string; error?: string }
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const currentUser = await getCurrentAuthUser()

  if (currentUser) {
    redirect("/dashboard")
  }

  return <LoginForm verifyStatus={resolvedSearchParams?.insforge_status} errorMessage={resolvedSearchParams?.error} />
}
