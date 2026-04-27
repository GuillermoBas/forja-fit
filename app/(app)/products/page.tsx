import { AddStockForm, ProductForm } from "@/features/products/product-forms"
import { PageHeader } from "@/components/page-header"
import { SearchTable } from "@/components/search-table"
import { Card, CardContent } from "@/components/ui/card"
import { getCurrentProfile } from "@/lib/auth/session"
import { isAdmin } from "@/lib/permissions/roles"
import { getProducts } from "@/lib/data"
import { formatCurrency } from "@/lib/utils"

export default async function ProductsPage({
  searchParams
}: {
  searchParams?: Promise<{ edit?: string | string[] }> | { edit?: string | string[] }
}) {
  const [products, profile] = await Promise.all([getProducts(), getCurrentProfile()])
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const editId = Array.isArray(resolvedSearchParams?.edit)
    ? resolvedSearchParams?.edit[0]
    : resolvedSearchParams?.edit
  const selectedProduct = editId ? products.find((product) => product.id === editId) ?? null : null
  const canManageProducts = isAdmin(profile?.role)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        description="Suplementos, stock y mantenimiento de catálogo para el día a día."
      />

      {canManageProducts ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <ProductForm product={selectedProduct} />
          <AddStockForm products={products.filter((product) => product.isActive)} />
        </div>
      ) : (
        <Card className="rounded-3xl">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Los entrenadores pueden consultar el catálogo, pero solo admin puede editar precios y stock.
          </CardContent>
        </Card>
      )}

      <SearchTable
        rows={products.map((row) => ({
          id: row.id,
          searchText: `${row.name} ${row.sku ?? ""} ${row.category ?? ""}`,
          cells: {
            name: {
              text: row.name,
              subtext: row.sku ?? "Sin SKU",
              href: canManageProducts ? `/products?edit=${row.id}` : undefined
            },
            category: { text: row.category ?? "Sin categoría" },
            price: { text: formatCurrency(row.priceGross) },
            stock: { text: String(row.stockOnHand) },
            minimum: { text: String(row.minStock) },
            alert: {
              text: row.stockOnHand <= row.minStock ? "Stock bajo" : "Correcto",
              badgeVariant: row.stockOnHand <= row.minStock ? "warning" : "success"
            },
            status: {
              text: row.isActive ? "Activo" : "Inactivo",
              badgeVariant: row.isActive ? "success" : "secondary"
            }
          }
        }))}
        columns={[
          { key: "name", label: "Producto" },
          { key: "category", label: "Categoría" },
          { key: "price", label: "Precio" },
          { key: "stock", label: "Stock" },
          { key: "minimum", label: "Mínimo" },
          { key: "alert", label: "Alerta" },
          { key: "status", label: "Estado" }
        ]}
        searchPlaceholder="Buscar producto por nombre, SKU o categoría"
      />
    </div>
  )
}
