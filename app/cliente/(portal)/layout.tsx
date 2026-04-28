import { PortalShell } from "@/features/client-portal/portal-shell"
import { getPortalShellData } from "@/features/client-portal/data"

export default async function AuthenticatedClientPortalLayout({
  children
}: {
  children: React.ReactNode
}) {
  const shellData = await getPortalShellData()

  return <PortalShell clientName={shellData.client.fullName}>{children}</PortalShell>
}
