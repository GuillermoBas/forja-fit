"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useFormState } from "react-dom"
import { toast } from "sonner"
import { upsertExpenseAction } from "@/features/expenses/actions"
import type { Expense } from "@/types/domain"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AuthFormSubmit } from "@/features/auth/auth-form-submit"
import { formatPaymentMethod, nativeSelectClassName } from "@/lib/utils"

export function ExpenseForm({
  expense
}: {
  expense?: Expense | null
}) {
  const [state, formAction] = useFormState(upsertExpenseAction, {})

  useEffect(() => {
    if (state.error) {
      toast.error(state.error)
    }
  }, [state.error])

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle>{expense ? "Editar gasto" : "Nuevo gasto"}</CardTitle>
        <CardDescription>Base, IVA, proveedor y método de pago para la contabilidad mensual.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="id" defaultValue={expense?.id ?? ""} />
          <div className="space-y-2">
            <label className="text-sm font-medium">Fecha</label>
            <Input name="spentOn" type="date" defaultValue={expense?.spentOn ?? new Date().toISOString().slice(0, 10)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Categoría</label>
            <Input name="category" defaultValue={expense?.category ?? ""} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Proveedor</label>
            <Input name="supplier" defaultValue={expense?.supplier ?? ""} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Método de pago</label>
            <select name="paymentMethod" className={nativeSelectClassName} defaultValue={expense?.paymentMethod ?? "cash"}>
              <option value="cash">{formatPaymentMethod("cash")}</option>
              <option value="card">{formatPaymentMethod("card")}</option>
              <option value="transfer">{formatPaymentMethod("transfer")}</option>
              <option value="bizum">{formatPaymentMethod("bizum")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Base imponible</label>
            <Input name="baseAmount" type="number" min="0" step="0.01" defaultValue={expense?.baseAmount ?? 0} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">IVA</label>
            <Input name="vatAmount" type="number" min="0" step="0.01" defaultValue={expense?.vatAmount ?? 0} required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">Nota</label>
            <Input name="note" defaultValue={expense?.note ?? ""} />
          </div>
          <div className="flex flex-col gap-3 md:col-span-2 md:flex-row">
            <AuthFormSubmit idleLabel={expense ? "Guardar gasto" : "Registrar gasto"} pendingLabel="Guardando..." />
            {expense ? (
              <Button asChild variant="outline" className="w-full">
                <Link href="/expenses">Limpiar edición</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
