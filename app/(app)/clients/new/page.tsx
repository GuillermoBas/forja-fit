import { PageHeader } from "@/components/page-header"
import { ClientForm } from "@/features/clients/client-form"

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Nuevo cliente" description="Alta manual de cliente para operativa del gimnasio." />
      <ClientForm />
    </div>
  )
}
