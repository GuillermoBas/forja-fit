import { DailyExpiryScanForm, InternalNotificationForm } from "@/features/notifications/notification-forms"
import { PageHeader } from "@/components/page-header"
import { SearchTable } from "@/components/search-table"
import { getCurrentProfile } from "@/lib/auth/session"
import { getClients, getNotifications } from "@/lib/data"
import { isAdmin } from "@/lib/permissions/roles"
import { formatDate, formatNotificationChannel, formatNotificationStatus, formatNotificationType } from "@/lib/utils"

export default async function NotificationsPage() {
  const [notifications, clients, profile] = await Promise.all([
    getNotifications(),
    getClients(),
    getCurrentProfile()
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificaciones"
        description="Avisos internos y emails de caducidad con su estado de entrega."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <InternalNotificationForm clients={clients} />
        {isAdmin(profile?.role) ? <DailyExpiryScanForm /> : null}
      </div>

      <SearchTable
        rows={notifications.map((row) => {
          const visibleRecipient = row.channel === "email" ? row.recipient ?? "" : ""

          return {
            id: row.id,
            searchText: `${row.type} ${row.clientName ?? ""} ${row.status} ${row.channel} ${visibleRecipient}`,
            cells: {
              type: { text: formatNotificationType(row.type) },
              channel: { text: formatNotificationChannel(row.channel), badgeVariant: row.channel === "email" ? "secondary" : "success" },
              status: {
                text: formatNotificationStatus(row.status),
                badgeVariant:
                  row.status === "sent"
                    ? "success"
                    : row.status === "failed"
                      ? "danger"
                      : row.status === "skipped"
                        ? "warning"
                        : "secondary"
              },
              client: { text: row.clientName ?? "Sistema", subtext: visibleRecipient || undefined },
              subject: { text: row.subject ?? "Sin asunto", subtext: row.message.slice(0, 80) },
              date: { text: formatDate(row.createdAt) }
            }
          }
        })}
        columns={[
          { key: "type", label: "Tipo" },
          { key: "channel", label: "Canal" },
          { key: "status", label: "Estado" },
          { key: "client", label: "Cliente" },
          { key: "subject", label: "Asunto / mensaje" },
          { key: "date", label: "Fecha" }
        ]}
        searchPlaceholder="Filtrar por tipo, cliente, canal, destinatario o estado"
      />
    </div>
  )
}
