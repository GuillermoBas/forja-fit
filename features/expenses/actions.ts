"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"

export type ExpenseActionState = {
  error?: string
}

export async function upsertExpenseAction(
  _prevState: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  try {
    await invokeProtectedFunction("create_expense", {
      id: String(formData.get("id") ?? "").trim() || undefined,
      spentOn: String(formData.get("spentOn") ?? "").trim(),
      category: String(formData.get("category") ?? "").trim(),
      supplier: String(formData.get("supplier") ?? "").trim(),
      paymentMethod: String(formData.get("paymentMethod") ?? "").trim(),
      baseAmount: Number(formData.get("baseAmount") ?? 0),
      vatAmount: Number(formData.get("vatAmount") ?? 0),
      note: String(formData.get("note") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo guardar el gasto")
  }

  revalidatePath("/expenses")
  revalidatePath("/dashboard")
  revalidatePath("/reports")
  redirect("/expenses")
}
