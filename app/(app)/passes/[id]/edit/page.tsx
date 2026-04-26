import { notFound } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { PassEditorForm } from "@/features/passes/pass-admin-forms"
import { requireAdmin } from "@/lib/permissions/guards"
import { getClients, getPassById, getPassTypes } from "@/lib/data"

export default async function EditPassPage({
  params
}: {
  params: { id: string }
}) {
  await requireAdmin()

  const [pass, passTypes, clients] = await Promise.all([
    getPassById(params.id),
    getPassTypes({ includeInactive: true }),
    getClients()
  ])

  if (!pass) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar bono"
        description="Gestiona titulares, tipo, saldo y limpieza de bonos creados por error."
      />
      <PassEditorForm pass={pass} passTypes={passTypes} clients={clients} />
    </div>
  )
}
