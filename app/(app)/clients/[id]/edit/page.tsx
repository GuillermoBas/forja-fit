import { notFound } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { ClientForm } from "@/features/clients/client-form"
import { getCurrentProfile } from "@/lib/auth/session"
import { getClientById, getClientPortalSupportState } from "@/lib/data"
import { isAdmin } from "@/lib/permissions/roles"

export default async function EditClientPage({
  params
}: {
  params: { id: string }
}) {
  const client = await getClientById(params.id)
  const profile = await getCurrentProfile()
  const portalSupport = await getClientPortalSupportState(params.id)

  if (!client) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Editar cliente" description="Actualiza la ficha operativa del cliente." />
      <ClientForm
        client={client}
        canDelete={isAdmin(profile?.role)}
        portalSupport={isAdmin(profile?.role) ? portalSupport : null}
      />
    </div>
  )
}
