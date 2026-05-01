"use client"

import Link from "next/link"
import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import {
  addStockAction,
  deleteProductAction,
  reduceStockAction,
  upsertProductAction
} from "@/features/products/actions"
import type { Product } from "@/types/domain"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { nativeSelectClassName } from "@/lib/utils"

function ActionToast({
  error,
  success
}: {
  error?: string
  success?: string
}) {
  useEffect(() => {
    if (error) {
      toast.error(error)
    }
  }, [error])

  useEffect(() => {
    if (success) {
      toast.success(success)
    }
  }, [success])

  return null
}

export function ProductForm({
  product
}: {
  product?: Product | null
}) {
  const [state, formAction] = useActionState(upsertProductAction, {})
  const [deleteState, deleteAction] = useActionState(deleteProductAction, {})

  return (
    <Card className="rounded-3xl">
      <ActionToast error={state.error} success={state.success} />
      <ActionToast error={deleteState.error} success={deleteState.success} />
      <CardHeader>
        <CardTitle>{product ? "Editar producto" : "Nuevo producto"}</CardTitle>
        <CardDescription>Precio, IVA, SKU, categoria y stock minimo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
            <label className="text-sm font-medium">Categoria</label>
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
            <label className="text-sm font-medium">Stock minimo</label>
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
                <Link href="/products">Limpiar edicion</Link>
              </Button>
            ) : null}
          </div>
        </form>

        {product ? (
          <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <div>
              <h3 className="text-sm font-semibold">Borrado de producto</h3>
              <p className="text-sm text-muted-foreground">
                Solo puedes borrar productos que nunca hayan aparecido en una venta.
              </p>
            </div>
            {product.canDelete ? (
              <form
                action={deleteAction}
                onSubmit={(event) => {
                  if (!window.confirm(`Se borrara "${product.name}". Esta accion no se puede deshacer.`)) {
                    event.preventDefault()
                  }
                }}
              >
                <input type="hidden" name="productId" value={product.id} />
                <Button type="submit" variant="destructive" className="w-full md:w-auto">
                  Borrar producto
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Este producto ya tiene historial de ventas ({product.saleItemCount ?? 0} lineas) y no se puede borrar.
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function AddStockForm({
  products
}: {
  products: Product[]
}) {
  const [state, formAction] = useActionState(addStockAction, {})

  return (
    <Card className="rounded-3xl">
      <ActionToast error={state.error} success={state.success} />
      <CardHeader>
        <CardTitle>Anadir stock</CardTitle>
        <CardDescription>Solo admin. Este ajuste suma unidades al stock actual.</CardDescription>
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
            <AuthFormSubmit idleLabel="Anadir stock" pendingLabel="Actualizando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ReduceStockForm({
  products
}: {
  products: Product[]
}) {
  const [state, formAction] = useActionState(reduceStockAction, {})

  return (
    <Card className="rounded-3xl">
      <ActionToast error={state.error} success={state.success} />
      <CardHeader>
        <CardTitle>Reducir stock</CardTitle>
        <CardDescription>
          Solo admin. Para mermas, roturas o ajustes manuales con motivo obligatorio.
        </CardDescription>
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
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Motivo</label>
            <Input name="reason" required placeholder="Ej.: rotura, merma, ajuste de inventario" />
          </div>
          <div className="md:col-span-2">
            <AuthFormSubmit idleLabel="Reducir stock" pendingLabel="Actualizando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
