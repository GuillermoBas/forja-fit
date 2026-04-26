import { getCurrentProfile } from "@/lib/auth/session"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/page-header"
import { isAdmin } from "@/lib/permissions/roles"
import { getReportsData } from "@/lib/reports"
import { formatCurrency } from "@/lib/utils"

function ReportList({
  title,
  rows
}: {
  title: string
  rows: Array<{ label: string; amount: number }>
}) {
  return (
    <Card className="panel-hover">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length ? (
          rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border/90 bg-surface-alt/80 p-3 text-sm"
            >
              <span className="text-text-secondary">{row.label}</span>
              <span className="font-semibold text-text-primary">{formatCurrency(row.amount)}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-text-secondary">Sin datos para el rango seleccionado.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: { from?: string | string[]; to?: string | string[] }
}) {
  const from = Array.isArray(searchParams?.from) ? searchParams?.from[0] : searchParams?.from
  const to = Array.isArray(searchParams?.to) ? searchParams?.to[0] : searchParams?.to
  const [reports, profile] = await Promise.all([
    getReportsData({ from, to }),
    getCurrentProfile()
  ])
  const showAdminEmailQuality = isAdmin(profile?.role)
  const emailQuality = reports.clientEmailQuality

  return (
    <div className="space-y-6">
      <PageHeader
        title="Informes"
        description="Lecturas rápidas y legibles para ventas, bonos, gastos y stock."
      />

      <Card>
        <CardContent className="p-6">
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-2">
              <label className="text-sm font-medium">Desde</label>
              <Input
                name="from"
                type="date"
                defaultValue={reports.from === "0000-01-01" ? "" : reports.from}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Hasta</label>
              <Input
                name="to"
                type="date"
                defaultValue={reports.to === "9999-12-31" ? "" : reports.to}
              />
            </div>
            <Button type="submit" className="px-7 md:self-end">
              Aplicar rango
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="panel-hover">
          <CardHeader><CardTitle>Ventas por rango</CardTitle></CardHeader>
          <CardContent className="font-heading text-3xl font-bold">{formatCurrency(reports.totals.sales)}</CardContent>
        </Card>
        <Card className="panel-hover">
          <CardHeader><CardTitle>Gastos por rango</CardTitle></CardHeader>
          <CardContent className="font-heading text-3xl font-bold">{formatCurrency(reports.totals.expenses)}</CardContent>
        </Card>
        <Card className="panel-hover">
          <CardHeader><CardTitle>Margen estimado</CardTitle></CardHeader>
          <CardContent className="font-heading text-3xl font-bold">{formatCurrency(reports.totals.estimatedMargin)}</CardContent>
        </Card>
        <Card className="panel-hover">
          <CardHeader><CardTitle>Stock bajo mínimos</CardTitle></CardHeader>
          <CardContent className="font-heading text-3xl font-bold">{reports.lowStockProducts.length} productos</CardContent>
        </Card>
        <Card className="panel-hover">
          <CardHeader><CardTitle>Bonos próximos a caducar</CardTitle></CardHeader>
          <CardContent className="font-heading text-3xl font-bold">{reports.expiringPasses.length} bonos</CardContent>
        </Card>
        <Card className="panel-hover">
          <CardHeader><CardTitle>Bonos sin sesiones</CardTitle></CardHeader>
          <CardContent className="font-heading text-3xl font-bold">{reports.noSessionPasses.length} bonos</CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ReportList title="Ventas por fecha" rows={reports.salesByDate} />
        <ReportList title="Ventas por producto" rows={reports.salesByProduct} />
        <ReportList title="Ventas por tipo de bono" rows={reports.salesByPassType} />
        <ReportList title="Gastos por categoría" rows={reports.expensesByCategory} />
        <ReportList title="Métodos de pago" rows={reports.paymentMethodSplit} />

        <Card className="panel-hover">
          <CardHeader>
            <CardTitle>Stock bajo mínimos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reports.lowStockProducts.length ? (
              reports.lowStockProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border/90 bg-surface-alt/80 p-3 text-sm"
                >
                  <span className="text-text-secondary">{product.name}</span>
                  <span className="font-semibold text-text-primary">
                    {product.stockOnHand} / mínimo {product.minStock}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-secondary">No hay productos por debajo del mínimo.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {showAdminEmailQuality ? (
        <section className="space-y-4">
          <PageHeader
            title="Calidad de emails"
            description="Revisión previa al portal de cliente para detectar fichas que necesitan limpieza."
          />

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="panel-hover">
              <CardHeader>
                <CardTitle>Sin email</CardTitle>
              </CardHeader>
              <CardContent className="font-heading text-3xl font-bold">
                {emailQuality.missingEmail.length}
              </CardContent>
            </Card>

            <Card className="panel-hover">
              <CardHeader>
                <CardTitle>Emails duplicados</CardTitle>
              </CardHeader>
              <CardContent className="font-heading text-3xl font-bold">
                {emailQuality.duplicateEmails.length}
              </CardContent>
            </Card>

            <Card className="panel-hover">
              <CardHeader>
                <CardTitle>Ya reclamados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="font-heading text-3xl font-bold">
                  {emailQuality.claimedInPortal.length}
                </div>
                <Badge variant={emailQuality.portalAccountsAvailable ? "success" : "secondary"}>
                  {emailQuality.portalAccountsAvailable ? "Tabla portal detectada" : "Tabla portal pendiente"}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="panel-hover">
              <CardHeader>
                <CardTitle>Clientes sin email</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {emailQuality.missingEmail.length ? (
                  emailQuality.missingEmail.map((client) => (
                    <div
                      key={client.clientId}
                      className="rounded-2xl border border-border/90 bg-surface-alt/80 p-3 text-sm"
                    >
                      <p className="font-medium text-text-primary">{client.clientName}</p>
                      <p className="text-text-secondary">Sin email informado</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-secondary">No hay clientes sin email.</p>
                )}
              </CardContent>
            </Card>

            <Card className="panel-hover">
              <CardHeader>
                <CardTitle>Emails duplicados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {emailQuality.duplicateEmails.length ? (
                  emailQuality.duplicateEmails.map((group) => (
                    <div
                      key={group.normalizedEmail}
                      className="rounded-2xl border border-border/90 bg-surface-alt/80 p-3 text-sm"
                    >
                      <p className="font-medium text-text-primary">{group.normalizedEmail}</p>
                      <p className="text-text-secondary">
                        {group.clients.map((client) => client.clientName).join(", ")}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-secondary">No hay emails duplicados.</p>
                )}
              </CardContent>
            </Card>

            <Card className="panel-hover">
              <CardHeader>
                <CardTitle>Clientes ya reclamados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {emailQuality.claimedInPortal.length ? (
                  emailQuality.claimedInPortal.map((client) => (
                    <div
                      key={client.clientId}
                      className="rounded-2xl border border-border/90 bg-surface-alt/80 p-3 text-sm"
                    >
                      <p className="font-medium text-text-primary">{client.clientName}</p>
                      <p className="text-text-secondary">{client.email ?? "Sin email"}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-secondary">
                    {emailQuality.portalAccountsAvailable
                      ? "No hay clientes reclamados todavía."
                      : "Aún no existe la tabla de cuentas del portal."}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      ) : null}
    </div>
  )
}
