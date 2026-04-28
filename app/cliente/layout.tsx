import { ClientPortalPersistentShell } from "@/features/client-portal/persistent-shell"

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return <ClientPortalPersistentShell>{children}</ClientPortalPersistentShell>
}
