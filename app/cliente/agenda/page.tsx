import { AgendaCalendar } from "@/features/client-portal/agenda-calendar"
import { getPortalDashboardData } from "@/features/client-portal/data"
import { PortalShell } from "@/features/client-portal/portal-shell"

export default async function ClientPortalAgendaPage() {
  const data = await getPortalDashboardData()

  return (
    <PortalShell
      title="Agenda"
      description="Vista mensual de sesiones y recordatorios."
      clientName={data.client.fullName}
      currentPath="/cliente/agenda"
    >
      <AgendaCalendar />
    </PortalShell>
  )
}
