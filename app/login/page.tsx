import { redirect } from "next/navigation"
import { LoginForm } from "@/features/auth/login-form"
import { getCurrentAuthUser } from "@/lib/auth/session"

export default async function LoginPage({
  searchParams
}: {
  searchParams?: { insforge_status?: string; error?: string }
}) {
  const currentUser = await getCurrentAuthUser()

  if (currentUser) {
    redirect("/dashboard")
  }

  return <LoginForm verifyStatus={searchParams?.insforge_status} errorMessage={searchParams?.error} />
}
