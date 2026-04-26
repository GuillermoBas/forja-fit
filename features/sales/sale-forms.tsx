"use client"

import { useEffect } from "react"
import { useFormState } from "react-dom"
import { toast } from "sonner"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import {
  createSaleAction,
  generateTicketPdfAction,
  voidSaleAction
} from "@/features/sales/actions"
import type { Client, Product, Sale } from "@/types/domain"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatPaymentMethod, nativeSelectClassName } from "@/lib/utils"

function ErrorToast({ message }: { message?: string }) {
  useEffect(() => {
    if (message) {
      toast.error(message)
    }
  }, [message])

  return null
}

export function CreateSaleForm({
  clients,
  products
}: {
  clients: Client[]
  products: Product[]
}) {
  const [state, formAction] = useFormState(createSaleAction, {})

  return (
    <Card className="rounded-3xl">
      <ErrorToast message={state.error} />
      <CardHeader>
        <CardTitle>Nueva venta de productos</CardTitle>
        <CardDescription>Hasta 3 líneas por ticket. El precio se lee siempre desde base de datos.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Cliente</label>
            <select name="clientId" className={nativeSelectClassName}>
              <option value="">Sin cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Método de pago</label>
            <select name="paymentMethod" className={nativeSelectClassName}>
              <option value="cash">{formatPaymentMethod("cash")}</option>
              <option value="card">{formatPaymentMethod("card")}</option>
              <option value="transfer">{formatPaymentMethod("transfer")}</option>
              <option value="bizum">{formatPaymentMethod("bizum")}</option>
            </select>
          </div>
          {[0, 1, 2].map((index) => (
            <div key={index} className="grid gap-4 rounded-2xl border p-4 md:col-span-2 md:grid-cols-[2fr_1fr]">
              <div className="space-y-2">
                <label className="text-sm font-medium">Producto {index + 1}</label>
                <select
                  name={`productId_${index}`}
                  className={nativeSelectClassName}
                  defaultValue=""
                >
                  <option value="">Sin usar</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.stockOnHand} uds.)
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cantidad</label>
                <Input name={`qty_${index}`} type="number" min="0" step="1" defaultValue={index === 0 ? 1 : 0} />
              </div>
            </div>
          ))}
          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre fiscal</label>
            <Input name="fiscalName" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">NIF fiscal</label>
            <Input name="fiscalTaxId" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Nota interna</label>
            <Input name="internalNote" />
          </div>
          <div className="md:col-span-2">
            <AuthFormSubmit idleLabel="Crear venta y ticket" pendingLabel="Procesando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function GenerateTicketForm({
  sales
}: {
  sales: Sale[]
}) {
  const [state, formAction] = useFormState(generateTicketPdfAction, {})

  return (
    <Card className="rounded-3xl">
      <ErrorToast message={state.error} />
      <CardHeader>
        <CardTitle>Generar o regenerar ticket</CardTitle>
        <CardDescription>Útil para ventas antiguas o renovaciones de bono que aún no tengan PDF.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Venta</label>
            <select name="saleId" className={nativeSelectClassName}>
              {sales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.invoiceCode} - {sale.clientName ?? "Sin cliente"}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <AuthFormSubmit idleLabel="Generar ticket PDF" pendingLabel="Generando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function VoidSaleForm({
  sales
}: {
  sales: Sale[]
}) {
  const [state, formAction] = useFormState(voidSaleAction, {})

  return (
    <Card className="rounded-3xl">
      <ErrorToast message={state.error} />
      <CardHeader>
        <CardTitle>Anular venta</CardTitle>
        <CardDescription>Solo admin. Si la venta incluye productos, el stock se repone de forma automática.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Venta publicada</label>
            <select name="saleId" className={nativeSelectClassName}>
              {sales.map((sale) => (
                <option key={sale.id} value={sale.id}>
                  {sale.invoiceCode} - {sale.totalAmount.toFixed(2)} €
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivo</label>
            <Input name="reason" required />
          </div>
          <div className="md:col-span-2">
            <AuthFormSubmit idleLabel="Anular venta" pendingLabel="Anulando..." />
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
