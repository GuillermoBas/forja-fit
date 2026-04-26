"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"

export type SaleActionState = {
  error?: string
}

function parseSaleItems(formData: FormData) {
  const items: Array<{ itemType: "product"; productId: string; qty: number }> = []

  for (let index = 0; index < 3; index += 1) {
    const productId = String(formData.get(`productId_${index}`) ?? "").trim()
    const qty = Number(formData.get(`qty_${index}`) ?? 0)

    if (!productId) {
      continue
    }

    if (qty <= 0) {
      throw new Error("Todas las líneas con producto deben tener cantidad mayor que cero")
    }

    items.push({
      itemType: "product",
      productId,
      qty
    })
  }

  if (!items.length) {
    throw new Error("La venta debe incluir al menos un producto")
  }

  return items
}

export async function createSaleAction(
  _prevState: SaleActionState,
  formData: FormData
): Promise<SaleActionState> {
  try {
    const result = await invokeProtectedFunction("create_sale", {
      clientId: String(formData.get("clientId") ?? "").trim() || undefined,
      paymentMethod: String(formData.get("paymentMethod") ?? "").trim(),
      fiscalName: String(formData.get("fiscalName") ?? "").trim(),
      fiscalTaxId: String(formData.get("fiscalTaxId") ?? "").trim(),
      internalNote: String(formData.get("internalNote") ?? "").trim(),
      items: parseSaleItems(formData)
    })

    if (result?.saleId) {
      try {
        await invokeProtectedFunction("generate_ticket_pdf", {
          saleId: result.saleId
        })
      } catch (error) {
        revalidatePath("/sales")
        revalidatePath("/products")
        return {
          error:
            error instanceof Error
              ? `La venta se creó, pero el ticket no se pudo generar: ${error.message}`
              : "La venta se creó, pero el ticket no se pudo generar"
        }
      }
    }
  } catch (error) {
    return toActionError(error, "No se pudo crear la venta")
  }

  revalidatePath("/sales")
  revalidatePath("/products")
  redirect("/sales")
}

export async function generateTicketPdfAction(
  _prevState: SaleActionState,
  formData: FormData
): Promise<SaleActionState> {
  try {
    await invokeProtectedFunction("generate_ticket_pdf", {
      saleId: String(formData.get("saleId") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo generar el ticket")
  }

  revalidatePath("/sales")
  redirect("/sales")
}

export async function voidSaleAction(
  _prevState: SaleActionState,
  formData: FormData
): Promise<SaleActionState> {
  try {
    await invokeProtectedFunction("void_sale", {
      saleId: String(formData.get("saleId") ?? "").trim(),
      reason: String(formData.get("reason") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo anular la venta")
  }

  revalidatePath("/sales")
  revalidatePath("/products")
  redirect("/sales")
}
