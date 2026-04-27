import { ExpenseForm } from "@/features/expenses/expense-form"
import { PageHeader } from "@/components/page-header"
import { SearchTable } from "@/components/search-table"
import { Card, CardContent } from "@/components/ui/card"
import { getExpenses } from "@/lib/data"
import { formatCurrency, formatDate, formatPaymentMethod } from "@/lib/utils"

export default async function ExpensesPage({
  searchParams
}: {
  searchParams?: Promise<{ edit?: string | string[] }> | { edit?: string | string[] }
}) {
  const expenses = await getExpenses()
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const editId = Array.isArray(resolvedSearchParams?.edit)
    ? resolvedSearchParams?.edit[0]
    : resolvedSearchParams?.edit
  const selectedExpense = editId ? expenses.find((expense) => expense.id === editId) ?? null : null
  const totalMonth = expenses
    .filter((expense) => expense.spentOn.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, expense) => sum + expense.totalAmount, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gastos"
        description="Registro mensual de gastos operativos con categorías, IVA y método de pago."
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <ExpenseForm expense={selectedExpense} />
        <Card className="rounded-3xl">
          <CardContent className="space-y-3 p-6">
            <p className="text-sm text-muted-foreground">Gasto total del mes</p>
            <p className="text-3xl font-semibold">{formatCurrency(totalMonth)}</p>
            <p className="text-sm text-muted-foreground">
              Se calcula desde `expenses.total_amount` para evitar discrepancias entre base e IVA.
            </p>
          </CardContent>
        </Card>
      </div>

      <SearchTable
        rows={expenses.map((row) => ({
          id: row.id,
          searchText: `${row.concept} ${row.category} ${row.supplier ?? ""} ${row.paymentMethod}`,
          cells: {
            concept: {
              text: row.concept,
              subtext: row.supplier ?? "Sin proveedor",
              href: `/expenses?edit=${row.id}`
            },
            category: { text: row.category },
            payment: { text: formatPaymentMethod(row.paymentMethod) },
            date: { text: formatDate(row.spentOn) },
            amount: { text: formatCurrency(row.totalAmount) }
          }
        }))}
        columns={[
          { key: "concept", label: "Concepto" },
          { key: "category", label: "Categoría" },
          { key: "payment", label: "Pago" },
          { key: "date", label: "Fecha" },
          { key: "amount", label: "Importe" }
        ]}
        searchPlaceholder="Buscar por concepto, categoría, proveedor o pago"
      />
    </div>
  )
}
