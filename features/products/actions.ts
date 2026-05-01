"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { invokeProtectedFunction, toActionError } from "@/lib/actions"

export type ProductActionState = {
  error?: string
  success?: string
}

export async function upsertProductAction(
  _prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  try {
    await invokeProtectedFunction("upsert_product", {
      id: String(formData.get("id") ?? "").trim() || undefined,
      name: String(formData.get("name") ?? "").trim(),
      sku: String(formData.get("sku") ?? "").trim(),
      category: String(formData.get("category") ?? "").trim(),
      priceGross: Number(formData.get("priceGross") ?? 0),
      vatRate: Number(formData.get("vatRate") ?? 0),
      minStock: Number(formData.get("minStock") ?? 0),
      isActive: formData.get("isActive") === "on"
    })
  } catch (error) {
    return toActionError(error, "No se pudo guardar el producto")
  }

  revalidatePath("/products")
  redirect("/products")
}

export async function addStockAction(
  _prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  try {
    await invokeProtectedFunction("add_stock", {
      productId: String(formData.get("productId") ?? ""),
      quantity: Number(formData.get("quantity") ?? 0)
    })
  } catch (error) {
    return toActionError(error, "No se pudo añadir stock")
  }

  revalidatePath("/products")
  redirect("/products")
}

export async function reduceStockAction(
  _prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  try {
    await invokeProtectedFunction("reduce_stock", {
      productId: String(formData.get("productId") ?? "").trim(),
      quantity: Number(formData.get("quantity") ?? 0),
      reason: String(formData.get("reason") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo reducir stock")
  }

  revalidatePath("/products")
  redirect("/products")
}

export async function deleteProductAction(
  _prevState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  try {
    await invokeProtectedFunction("delete_product", {
      productId: String(formData.get("productId") ?? "").trim()
    })
  } catch (error) {
    return toActionError(error, "No se pudo borrar el producto")
  }

  revalidatePath("/products")
  redirect("/products")
}
