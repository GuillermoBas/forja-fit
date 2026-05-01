import { redirect } from "next/navigation"
import { LoginForm } from "@/features/auth/login-form"
import { canBootstrapFirstAdmin } from "@/features/auth/server"
import { getCurrentAuthUser } from "@/lib/auth/session"

export default async function LoginPage({
  searchParams
}: {
  searchParams?:
    | Promise<{ insforge_status?: string; error?: string; reset?: string; activation?: string; email?: string }>
    | { insforge_status?: string; error?: string; reset?: string; activation?: string; email?: string }
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const [currentUser, canBootstrap] = await Promise.all([
    getCurrentAuthUser(),
    canBootstrapFirstAdmin()
  ])

  if (currentUser) {
    redirect("/dashboard")
  }

  return (
    <LoginForm
      verifyStatus={resolvedSearchParams?.insforge_status}
      errorMessage={resolvedSearchParams?.error}
      resetStatus={resolvedSearchParams?.reset}
      activationRequired={resolvedSearchParams?.activation === "required"}
      activationEmail={resolvedSearchParams?.email}
      canBootstrap={canBootstrap}
    />
  )
}
