import { AppShell } from "@/components/app-shell"
import { BlockedState } from "@/components/blocked-state"
import { requireAuthenticatedProfile } from "@/lib/auth/session"

export default async function ProtectedLayout({
  children
}: {
  children: React.ReactNode
}) {
  const { profile } = await requireAuthenticatedProfile()

  if (!profile) {
    return <BlockedState />
  }

  return <AppShell profile={profile}>{children}</AppShell>
}
