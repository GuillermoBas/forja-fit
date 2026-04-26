"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useFormState } from "react-dom"
import { toast } from "sonner"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { addStockAction, upsertProductAction } from "@/features/products/actions"
import type { Product } from "@/types/domain"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { nativeSelectClassName } from "@/lib/utils"

function ErrorToast({ message }: { message?: string }) {
  useEffect(() => {
    if (message) {
      toast.error(message)
    }
  }, [message])

  return null
}

export function ProductForm({
  product
}: {
  product?: Product | null
}) {
  const [state, formAction] = useFormState(upsertProductAction, {})

  return (
    <Card className="rounded-3xl">
      <ErrorToast message={state.error} />
      <CardHeader>
        <CardTitle>{product ? "Editar producto" : "Nuevo producto"}</CardTitle>
        <CardDescription>Precio, IVA, SKU, categoría y stock mínimo.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="id" defaultValue={product?.id ?? ""} />
          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre</label>
            <Input name="name" defaultValue={product?.name ?? ""} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">SKU</label>
            <Input name="sku" defaultValue={product?.sku ?? ""} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Categoría</label>
            <Input name="category" defaultValue={product?.category ?? ""} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Precio bruto</label>
            <Input
              name="priceGross"
              type="number"
              min="0"
              step="0.01"
              defaultValue={product?.priceGross ?? 0}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">IVA %</label>
            <Input
              name="vatRate"
              type="number"
              min="0"
              step="0.01"
              defaultValue={product?.vatRate ?? 21}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Stock mínimo</label>
            <Input
              name="minStock"
              type="number"
              min="0"
              step="1"
              defaultValue={product?.minStock ?? 0}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked={product?.isActive ?? true} />
            Producto activo
          </label>
          <div className="flex flex-col gap-3 md:col-span-2 md:flex-row">
            <AuthFormSubmit
              idleLabel={product ? "Guardar producto" : "Crear producto"}
              pendingLabel="Guardando..."
            />
            {product ? (
              <Button asChild variant="outline" className="w-full">
                <Link href="/products">Limpiar edición</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function AddStockForm({
  products
}: {
  products: Product[]
}) {
  const [state, formAction] = useFormState(addStockAction, {})

  return (
    <Card className="rounded-3xl">
      <ErrorToast message={state.error} />
      <CardHeader>
        <CardTitle>Añadir stock</CardTitle>
        <CardDescription>Solo admin. El stock nunca baja por esta vía, solo suma unidades.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Producto</label>
            <select name="productId" className={nativeSelectClassName}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.stockOnHand} uds.)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Cantidad</label>
            <Input name="quantity" type="number" min="1" step="1" defaultValue={1} required />
          </div>
          <div className="md:col-span-2">
            <AuthFormSubmit idleLabel="Añadir stock" pendingLabel="Actualizando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
