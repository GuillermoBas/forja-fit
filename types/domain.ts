export type AppRole = "admin" | "trainer"
export type PaymentMethod = "cash" | "card" | "transfer" | "bizum"
export type CalendarStatus = "scheduled" | "completed" | "cancelled" | "no_show"
export type NotificationChannel = "internal" | "email" | "push"
export type PassKind = "session" | "monthly"
export type PassSubType = "individual" | "shared_2" | "shared_3"
export type NotificationType =
  | "renewal_confirmation"
  | "expiry_reminder_d7"
  | "expiry_reminder_d0"
  | "pass_expiry_d7"
  | "pass_expiry_d0"
  | "pass_assigned"
  | "calendar_session_24h"
  | "manual_note"

export interface Profile {
  id: string
  email: string
  fullName: string
  role: AppRole
  calendarColor: string
}

export interface StaffProfileSummary {
  id: string
  fullName: string
  email: string
  role: AppRole
  isActive: boolean
  emailVerified: boolean
}

export interface BusinessSettings {
  id: string
  businessName: string
  timezone: string
  reminderDaysDefault: number
  defaultVatRate: number
}

export interface Client {
  id: string
  fullName: string
  firstName?: string
  lastName?: string
  email: string | null
  phone: string | null
  taxId?: string | null
  notes: string | null
  isActive: boolean
}

export interface ClientPortalAccountSummary {
  id: string
  clientId: string
  authUserId: string
  email: string
  status: "claimed" | "disabled"
  primaryProvider: "password" | "google"
  claimedAt: string
  lastLoginAt: string | null
}

export interface ClientPortalSupportState {
  clientId: string
  email: string | null
  emailMatchCount: number
  portalAccount: ClientPortalAccountSummary | null
  readiness:
    | "missing_email"
    | "duplicate_email"
    | "ready_to_claim"
    | "claimed"
    | "disabled"
  message: string
}

export interface PassType {
  id: string
  name: string
  kind: PassKind
  sessionCount: number | null
  price: number
  vatRate: number
  sharedAllowed: boolean
  isActive: boolean
  sortOrder: number
  passCount?: number
  canDelete?: boolean
}

export interface Pass {
  id: string
  passTypeId: string
  passTypeName: string
  passKind: PassKind
  passSubType: PassSubType | null
  holderClientIds: string[]
  holderNames: string[]
  purchasedByClientId: string | null
  purchasedByName: string | null
  contractedOn: string
  createdAt?: string
  pauseStartsOn?: string | null
  pauseEndsOn?: string | null
  soldPriceGross: number
  originalSessions: number | null
  sessionsLeft: number | null
  expiresOn: string
  status: "active" | "paused" | "out_of_sessions" | "expired" | "cancelled"
  notes: string | null
}

export interface Product {
  id: string
  name: string
  sku?: string | null
  category?: string | null
  price: number
  priceGross: number
  vatRate: number
  stock: number
  stockOnHand: number
  lowStockThreshold: number
  minStock: number
  isActive: boolean
  saleItemCount?: number
  canDelete?: boolean
}

export interface Sale {
  id: string
  invoiceNumber: number
  invoiceCode: string
  soldAt: string
  totalAmount: number
  paymentMethod: PaymentMethod
  saleType: "pass" | "product"
  clientName: string | null
  isVoided: boolean
  status: "posted" | "void"
  ticketPublicUrl: string | null
}

export interface Expense {
  id: string
  concept: string
  category: string
  supplier: string | null
  paymentMethod: PaymentMethod
  baseAmount: number
  vatAmount: number
  amount: number
  totalAmount: number
  spentOn: string
  note: string | null
}

export interface NotificationLogItem {
  id: string
  type: NotificationType
  channel: NotificationChannel
  channels?: NotificationChannel[]
  status: "queued" | "sent" | "failed" | "skipped"
  clientName: string | null
  recipient: string | null
  subject: string | null
  createdAt: string
  message: string
  dedupeKey?: string | null
}

export interface CalendarSession {
  id: string
  trainerProfileId?: string
  trainerName: string
  trainerColor: string
  client1Id?: string
  client2Id?: string | null
  clientNames: string[]
  passId?: string | null
  passIds: string[]
  passLabels: string[]
  startsAt: string
  endsAt: string
  status: CalendarStatus
  notes?: string | null
}
