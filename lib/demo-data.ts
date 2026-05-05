import type {
  CalendarSession,
  Client,
  Expense,
  NotificationLogItem,
  Pass,
  PassType,
  Product,
  Profile,
  Sale
} from "@/types/domain"

export const demoProfile: Profile = {
  id: "demo-admin",
  gymId: "visual-preview-gym",
  email: "admin@trainium.local",
  fullName: "Admin Trainium",
  role: "admin",
  calendarColor: "#BFDBFE"
}

export const demoClients: Client[] = [
  {
    id: "c1",
    fullName: "Lucia Moreno",
    email: "lucia@example.com",
    phone: "600111222",
    notes: "Entrena fuerza 3 dias por semana",
    isActive: true
  },
  {
    id: "c2",
    fullName: "Sergio Cano",
    email: "sergio@example.com",
    phone: "600333444",
    notes: "Prefiere horario de manana",
    isActive: true
  },
  {
    id: "c3",
    fullName: "Marta Rey",
    email: "marta@example.com",
    phone: "600555666",
    notes: null,
    isActive: true
  }
]

export const demoPassTypes: PassType[] = [
  {
    id: "pt8",
    name: "Bono 8 sesiones",
    kind: "session",
    sessionCount: 8,
    price: 180,
    vatRate: 21,
    sharedAllowed: true,
    isActive: true,
    sortOrder: 8
  },
  {
    id: "pt10",
    name: "Bono 10 sesiones",
    kind: "session",
    sessionCount: 10,
    price: 215,
    vatRate: 21,
    sharedAllowed: true,
    isActive: true,
    sortOrder: 10
  },
  {
    id: "pt12",
    name: "Bono 12 sesiones",
    kind: "session",
    sessionCount: 12,
    price: 250,
    vatRate: 21,
    sharedAllowed: true,
    isActive: true,
    sortOrder: 12
  },
  {
    id: "ptm",
    name: "Mensual",
    kind: "monthly",
    sessionCount: null,
    price: 165,
    vatRate: 21,
    sharedAllowed: true,
    isActive: true,
    sortOrder: 99
  }
]

export const demoPasses: Pass[] = [
  {
    id: "p1",
    passTypeId: "pt10",
    passTypeName: "Bono 10 sesiones",
    passKind: "session",
    passSubType: null,
    holderClientIds: ["c1"],
    holderNames: ["Lucia Moreno"],
    purchasedByClientId: "c1",
    purchasedByName: "Lucia Moreno",
    contractedOn: "2026-03-23",
    soldPriceGross: 180,
    originalSessions: 10,
    sessionsLeft: 2,
    expiresOn: "2026-04-22",
    status: "active",
    notes: null
  },
  {
    id: "p2",
    passTypeId: "pt8",
    passTypeName: "Bono 8 sesiones",
    passKind: "session",
    passSubType: null,
    holderClientIds: ["c2", "c3"],
    holderNames: ["Sergio Cano", "Marta Rey"],
    purchasedByClientId: "c2",
    purchasedByName: "Sergio Cano",
    contractedOn: "2026-03-19",
    soldPriceGross: 215,
    originalSessions: 8,
    sessionsLeft: 0,
    expiresOn: "2026-04-18",
    status: "out_of_sessions",
    notes: "Bono compartido"
  },
  {
    id: "p3",
    passTypeId: "ptm",
    passTypeName: "Mensual",
    passKind: "monthly",
    passSubType: null,
    holderClientIds: ["c1", "c2", "c3"],
    holderNames: ["Lucia Moreno", "Sergio Cano", "Marta Rey"],
    purchasedByClientId: "c1",
    purchasedByName: "Lucia Moreno",
    contractedOn: "2026-04-01",
    soldPriceGross: 165,
    originalSessions: null,
    sessionsLeft: null,
    expiresOn: "2026-04-30",
    status: "active",
    notes: "Acceso mensual compartido"
  }
]

export const demoProducts: Product[] = [
  {
    id: "pr1",
    name: "Proteina whey 1kg",
    sku: "WHEY-1KG",
    category: "proteina",
    price: 39.9,
    priceGross: 39.9,
    vatRate: 21,
    stock: 6,
    stockOnHand: 6,
    lowStockThreshold: 4,
    minStock: 4,
    isActive: true
  },
  {
    id: "pr2",
    name: "Creatina 300g",
    sku: "CREA-300",
    category: "rendimiento",
    price: 24.9,
    priceGross: 24.9,
    vatRate: 21,
    stock: 3,
    stockOnHand: 3,
    lowStockThreshold: 5,
    minStock: 5,
    isActive: true
  },
  {
    id: "pr3",
    name: "Barritas pack",
    sku: "BAR-PACK",
    category: "snacks",
    price: 12.5,
    priceGross: 12.5,
    vatRate: 10,
    stock: 12,
    stockOnHand: 12,
    lowStockThreshold: 5,
    minStock: 5,
    isActive: true
  }
]

export const demoSales: Sale[] = [
  {
    id: "s1",
    invoiceNumber: 1001,
    invoiceCode: "FF-001001",
    soldAt: "2026-04-17T08:15:00.000Z",
    totalAmount: 39.9,
    paymentMethod: "card",
    saleType: "product",
    clientName: "Lucia Moreno",
    isVoided: false,
    status: "posted",
    ticketPublicUrl: null
  },
  {
    id: "s2",
    invoiceNumber: 1002,
    invoiceCode: "FF-001002",
    soldAt: "2026-04-16T17:30:00.000Z",
    totalAmount: 215,
    paymentMethod: "bizum",
    saleType: "pass",
    clientName: "Sergio Cano",
    isVoided: false,
    status: "posted",
    ticketPublicUrl: null
  }
]

export const demoExpenses: Expense[] = [
  {
    id: "e1",
    concept: "Limpieza mensual",
    category: "operativa",
    supplier: "Limpiezas Norte",
    paymentMethod: "transfer",
    baseAmount: 74.38,
    vatAmount: 15.62,
    amount: 90,
    totalAmount: 90,
    spentOn: "2026-04-05"
    ,
    note: null
  },
  {
    id: "e2",
    concept: "Reposicion material",
    category: "equipamiento",
    supplier: "Proveedor Fit",
    paymentMethod: "card",
    baseAmount: 111.57,
    vatAmount: 23.43,
    amount: 135,
    totalAmount: 135,
    spentOn: "2026-04-12",
    note: null
  }
]

export const demoNotifications: NotificationLogItem[] = [
  {
    id: "n1",
    type: "renewal_confirmation",
    channel: "internal",
    status: "sent",
    clientName: "Sergio Cano",
    recipient: "staff",
    subject: "Renovacion registrada",
    createdAt: "2026-04-16T17:35:00.000Z",
    message: "Renovacion registrada. Confirmar por WhatsApp con el cliente."
  },
  {
    id: "n2",
    type: "expiry_reminder_d7",
    channel: "email",
    status: "queued",
    clientName: "Lucia Moreno",
    recipient: "lucia@example.com",
    subject: "Trainium: tu bono caduca en 7 días",
    createdAt: "2026-04-17T06:00:00.000Z",
    message: "Recordatorio de bono proximo a caducar en 7 dias."
  }
]

export const demoCalendarSessions: CalendarSession[] = [
  {
    id: "cs1",
    trainerProfileId: "demo-admin",
    trainerName: "Admin Trainium",
    trainerColor: "#BFDBFE",
    client1Id: "c1",
    client2Id: null,
    clientNames: ["Lucia Moreno"],
    passId: null,
    passIds: [],
    passLabels: [],
    startsAt: "2026-04-17T08:00:00.000Z",
    endsAt: "2026-04-17T09:00:00.000Z",
    status: "completed",
    notes: null
  },
  {
    id: "cs2",
    trainerProfileId: "demo-admin",
    trainerName: "Admin Trainium",
    trainerColor: "#BFDBFE",
    client1Id: "c2",
    client2Id: "c3",
    clientNames: ["Sergio Cano", "Marta Rey"],
    passId: null,
    passIds: [],
    passLabels: [],
    startsAt: "2026-04-17T17:00:00.000Z",
    endsAt: "2026-04-17T18:00:00.000Z",
    status: "scheduled",
    notes: null
  }
]
