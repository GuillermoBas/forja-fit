import { z } from "zod"

export const roleSchema = z.enum(["admin", "trainer"])

export const structuredErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional()
})

export const bootstrapAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2)
})

export const upsertClientSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional()
})

export const createPassSchema = z.object({
  passTypeId: z.string().uuid(),
  holderClientIds: z.array(z.string().uuid()).min(1).max(5),
  purchasedByClientId: z.string().uuid().optional(),
  passSubType: z.enum(["individual", "shared_2", "shared_3"]).optional(),
  paymentMethod: z.enum(["cash", "card", "transfer", "bizum"]),
  priceGross: z.number().int().nonnegative().optional(),
  contractedOn: z.string(),
  notes: z.string().optional()
})

export const upsertPassTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  kind: z.enum(["session", "monthly"]),
  sessionsTotal: z.number().int().min(1).max(30).nullable(),
  priceGross: z.number().nonnegative(),
  vatRate: z.number().nonnegative(),
  sharedAllowed: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional()
})

export const updatePassSchema = z.object({
  passId: z.string().uuid(),
  passTypeId: z.string().uuid(),
  holderClientIds: z.array(z.string().uuid()).min(1).max(5),
  purchasedByClientId: z.string().uuid().optional(),
  passSubType: z.enum(["individual", "shared_2", "shared_3"]).optional().or(z.literal("")),
  contractedOn: z.string(),
  status: z.enum(["active", "paused", "out_of_sessions", "expired", "cancelled"]),
  sessionsLeft: z.number().int().nonnegative().nullable(),
  notes: z.string().optional()
})

export const deletePassSchema = z.object({
  passId: z.string().uuid()
})

export const consumeSessionSchema = z.object({
  passId: z.string().uuid(),
  clientId: z.string().uuid(),
  consumedOn: z.string(),
  notes: z.string().optional()
})

export const pausePassSchema = z.object({
  passId: z.string().uuid(),
  startsOn: z.string(),
  endsOn: z.string(),
  reason: z.string().optional()
})

export const renewPassSchema = z.object({
  passId: z.string().uuid(),
  passTypeId: z.string().uuid(),
  paymentMethod: z.enum(["cash", "card", "transfer", "bizum"]),
  priceGross: z.number().int().nonnegative().optional(),
  contractedOn: z.string(),
  notes: z.string().optional()
})

export const schedulePassSessionsSchema = z.object({
  passId: z.string().uuid(),
  startOn: z.string(),
  mode: z.enum(["all", "pending"]).optional(),
  entries: z.array(z.object({
    weekday: z.number().int().min(1).max(7),
    hour: z.string().regex(/^([01]\d|2[0-3]):00$/),
    trainerProfileId: z.string().uuid()
  })).min(1).max(30)
})

export const upsertProductSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  sku: z.string().optional().or(z.literal("")),
  category: z.string().optional().or(z.literal("")),
  priceGross: z.number().nonnegative(),
  vatRate: z.number().nonnegative(),
  minStock: z.number().int().nonnegative(),
  isActive: z.boolean().optional()
})

export const addStockSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive()
})

export const createSaleSchema = z.object({
  clientId: z.string().uuid().optional(),
  paymentMethod: z.enum(["cash", "card", "transfer", "bizum"]),
  fiscalName: z.string().optional().or(z.literal("")),
  fiscalTaxId: z.string().optional().or(z.literal("")),
  internalNote: z.string().optional().or(z.literal("")),
  items: z.array(
    z.object({
      itemType: z.literal("product"),
      productId: z.string().uuid(),
      qty: z.number().int().positive()
    })
  ).min(1)
})

export const voidSaleSchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().min(3)
})

export const createExpenseSchema = z.object({
  concept: z.string().min(2),
  category: z.string().min(2),
  amount: z.number().positive(),
  spentOn: z.string(),
  paymentMethod: z.enum(["cash", "card", "transfer", "bizum"]).optional(),
  notes: z.string().optional()
})

export const upsertCalendarSessionSchema = z.object({
  id: z.string().uuid().optional(),
  trainerProfileId: z.string().uuid(),
  passIds: z.array(z.string().uuid()).min(1),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(["scheduled", "completed", "cancelled", "no_show"]),
  notes: z.string().optional()
})

export const deleteCalendarSessionSchema = z.object({
  sessionId: z.string().uuid()
})

export const updateProfileCalendarColorSchema = z.object({
  profileId: z.string().uuid(),
  calendarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
})

export const updateBusinessSettingsSchema = z.object({
  businessName: z.string().min(2),
  reminderDaysDefault: z.number().int().min(0).max(30),
  defaultVatRate: z.number().nonnegative(),
  brandAssetVersion: z.string().optional(),
  brandAssets: z.array(z.object({
    variant: z.enum([
      "source",
      "logo-512-png",
      "logo-512-webp",
      "favicon-16",
      "favicon-32",
      "apple-touch-icon-180",
      "icon-192",
      "icon-512",
      "maskable-icon-512",
      "badge-96"
    ]),
    filename: z.string(),
    contentType: z.enum(["image/png", "image/webp"]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sizeBytes: z.number().int().positive(),
    base64: z.string().min(1)
  })).optional()
})

export const runDailyExpiryScanSchema = z.object({
  runOn: z.string().optional()
})

export const sendExpiryEmailSchema = z.object({
  passId: z.string().uuid(),
  reminderType: z.enum(["expiry_reminder_d7", "expiry_reminder_d0", "pass_expiry_d7", "pass_expiry_d0"])
})

export const createInternalNotificationSchema = z.object({
  clientId: z.string().uuid().optional(),
  profileId: z.string().uuid().optional(),
  type: z.string(),
  message: z.string().min(1)
})

export const generateTicketPdfSchema = z.object({
  saleId: z.string().uuid()
})
