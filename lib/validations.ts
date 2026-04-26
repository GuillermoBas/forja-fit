import { z } from "zod"

export const clientSchema = z.object({
  fullName: z.string().min(2, "Nombre obligatorio"),
  email: z.string().email("Email no válido").optional().or(z.literal("")),
  phone: z.string().min(6, "Teléfono no válido").optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal(""))
})

export const passSchema = z.object({
  passTypeId: z.string().uuid().or(z.string().min(1)),
  holder1ClientId: z.string().uuid().or(z.string().min(1)),
  holder2ClientId: z.string().uuid().optional(),
  purchasedOn: z.string().min(1),
  price: z.number().nonnegative()
})

export const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().optional().or(z.literal("")),
  category: z.string().optional().or(z.literal("")),
  priceGross: z.number().nonnegative(),
  vatRate: z.number().nonnegative(),
  minStock: z.number().int().nonnegative()
})

export const expenseSchema = z.object({
  concept: z.string().min(2),
  category: z.string().min(2),
  amount: z.number().positive(),
  spentOn: z.string().min(1)
})
