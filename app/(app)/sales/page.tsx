import { CreateSaleForm, GenerateTicketForm, VoidSaleForm } from "@/features/sales/sale-forms"
import { PageHeader } from "@/components/page-header"
import { SearchTable } from "@/components/search-table"
import { Card, CardContent } from "@/components/ui/card"
import { getCurrentProfile } from "@/lib/auth/session"
import { getClients, getProducts, getSales } from "@/lib/data"
import { canVoidSales } from "@/lib/permissions/roles"
import { formatCurrency, formatDate, formatPaymentMethod } from "@/lib/utils"

export default async function SalesPage() {
  const [sales, clients, products, profile] = await Promise.all([
    getSales(),
    getClients(),
    getProducts(),
    getCurrentProfile()
  ])

  const postedSales = sales.filter((sale) => !sale.isVoided)
  const activeProducts = products.filter((product) => product.isActive)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventas"
        description="Ventas de productos, renovaciones de bono y tickets PDF en un único registro."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <CreateSaleForm clients={clients} products={activeProducts} />
        <GenerateTicketForm sales={sales} />
      </div>

      {canVoidSales(profile?.role) ? (
        <VoidSaleForm sales={postedSales} />
      ) : (
        <Card className="rounded-3xl">
          <CardContent className="p-6 text-sm text-muted-foreground">
            La anulación de ventas está reservada al perfil admin.
          </CardContent>
        </Card>
      )}

      <SearchTable
        rows={sales.map((row) => ({
          id: row.id,
          searchText: `${row.invoiceCode} ${row.clientName ?? ""} ${row.paymentMethod}`,
          cells: {
            invoice: { text: row.invoiceCode, subtext: `#${row.invoiceNumber}` },
            client: { text: row.clientName ?? "Sin cliente" },
            type: { text: row.saleType === "pass" ? "Bono" : "Producto" },
            payment: { text: formatPaymentMethod(row.paymentMethod) },
            date: { text: formatDate(row.soldAt) },
            total: { text: formatCurrency(row.totalAmount) },
            status: {
              text: row.isVoided ? "Anulada" : "Publicada",
              badgeVariant: row.isVoided ? "danger" : "success"
            },
            ticket: row.ticketPublicUrl
              ? { text: "Abrir PDF", href: row.ticketPublicUrl }
              : { text: "Pendiente" }
          }
        }))}
        columns={[
          { key: "invoice", label: "Factura" },
          { key: "client", label: "Cliente" },
          { key: "type", label: "Tipo" },
          { key: "payment", label: "Pago" },
          { key: "date", label: "Fecha" },
          { key: "total", label: "Total" },
          { key: "status", label: "Estado" },
          { key: "ticket", label: "Ticket" }
        ]}
        searchPlaceholder="Buscar por cliente, factura o método de pago"
      />
    </div>
  )
}
