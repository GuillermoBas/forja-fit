import { getCurrentAccessToken } from "@/lib/auth/session"
import { isInsforgeConfigured } from "@/lib/config"
import { createServerInsforgeClient } from "@/lib/insforge/server"
import { demoExpenses, demoPasses, demoProducts, demoSales } from "@/lib/demo-data"
import { formatPaymentMethod } from "@/lib/utils"
import { isStaffPreview } from "@/lib/preview-mode"

type DbRow = Record<string, unknown>

type EmailQualityItem = {
  clientId: string
  clientName: string
  email: string | null
}

type DuplicateEmailGroup = {
  normalizedEmail: string
  clients: EmailQualityItem[]
}

type ClientEmailQualityReport = {
  missingEmail: EmailQualityItem[]
  duplicateEmails: DuplicateEmailGroup[]
  claimedInPortal: EmailQualityItem[]
  portalAccountsAvailable: boolean
}

async function createAuthedClient() {
  if (await isStaffPreview()) {
    return null
  }

  if (!isInsforgeConfigured()) {
    return null
  }

  const accessToken = await getCurrentAccessToken()
  if (!accessToken) {
    return null
  }

  try {
    return createServerInsforgeClient({ accessToken }) as any
  } catch {
    return null
  }
}

function mapEmailQualityClient(row: DbRow): EmailQualityItem {
  const firstName = String(row.first_name ?? "").trim()
  const lastName = String(row.last_name ?? "").trim()

  return {
    clientId: String(row.id),
    clientName: [firstName, lastName].filter(Boolean).join(" ") || "Cliente sin nombre",
    email: row.email ? String(row.email).trim() : null
  }
}

function normalizeEmail(email: string | null) {
  return email ? email.trim().toLowerCase() : ""
}

function buildClientEmailQualityReport(
  clientRows: DbRow[],
  portalRows?: DbRow[] | null
): ClientEmailQualityReport {
  const clients = clientRows.map(mapEmailQualityClient)
  const missingEmail = clients.filter((client) => !normalizeEmail(client.email))

  const duplicateMap = new Map<string, EmailQualityItem[]>()
  for (const client of clients) {
    const normalizedEmail = normalizeEmail(client.email)
    if (!normalizedEmail) {
      continue
    }

    const existing = duplicateMap.get(normalizedEmail) ?? []
    existing.push(client)
    duplicateMap.set(normalizedEmail, existing)
  }

  const duplicateEmails = Array.from(duplicateMap.entries())
    .filter(([, groupedClients]) => groupedClients.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([normalizedEmail, groupedClients]) => ({
      normalizedEmail,
      clients: groupedClients.sort((left, right) => left.clientName.localeCompare(right.clientName))
    }))

  const claimedClientIds = new Set<string>()

  for (const row of portalRows ?? []) {
    const clientId = row.client_id ? String(row.client_id) : ""
    if (!clientId) {
      continue
    }

    const status = row.status ? String(row.status).trim().toLowerCase() : null
    const hasClaimedAt = Boolean(row.claimed_at)
    const hasAuthUser = Boolean(row.auth_user_id)

    if (hasClaimedAt || hasAuthUser || status === "claimed" || status === "active") {
      claimedClientIds.add(clientId)
    }
  }

  const claimedInPortal = clients
    .filter((client) => claimedClientIds.has(client.clientId))
    .sort((left, right) => left.clientName.localeCompare(right.clientName))

  return {
    missingEmail: missingEmail.sort((left, right) => left.clientName.localeCompare(right.clientName)),
    duplicateEmails,
    claimedInPortal,
    portalAccountsAvailable: Array.isArray(portalRows)
  }
}

export async function getReportsData(options?: {
  from?: string
  to?: string
}) {
  const from = options?.from ?? "0000-01-01"
  const to = options?.to ?? "9999-12-31"
  const client = await createAuthedClient()

  if (!client) {
    const filteredSales = demoSales.filter((sale) => {
      const day = sale.soldAt.slice(0, 10)
      return !sale.isVoided && day >= from && day <= to
    })
    const filteredExpenses = demoExpenses.filter((expense) => expense.spentOn >= from && expense.spentOn <= to)

    return {
      from,
      to,
      totals: {
        sales: filteredSales.reduce((sum, item) => sum + item.totalAmount, 0),
        expenses: filteredExpenses.reduce((sum, item) => sum + item.totalAmount, 0),
        estimatedMargin:
          filteredSales.reduce((sum, item) => sum + item.totalAmount, 0) -
          filteredExpenses.reduce((sum, item) => sum + item.totalAmount, 0)
      },
      salesByDate: filteredSales.map((sale) => ({ label: sale.soldAt.slice(0, 10), amount: sale.totalAmount })),
      salesByProduct: filteredSales.filter((sale) => sale.saleType === "product").map((sale) => ({ label: sale.invoiceCode, amount: sale.totalAmount })),
      salesByPassType: filteredSales.filter((sale) => sale.saleType === "pass").map((sale) => ({ label: "Bonos", amount: sale.totalAmount })),
      expensesByCategory: filteredExpenses.map((expense) => ({ label: expense.category, amount: expense.totalAmount })),
      paymentMethodSplit: filteredSales.map((sale) => ({ label: formatPaymentMethod(sale.paymentMethod), amount: sale.totalAmount })),
      lowStockProducts: demoProducts.filter((product) => product.stockOnHand <= product.minStock),
      expiringPasses: demoPasses.filter((pass) => pass.status === "active"),
      noSessionPasses: demoPasses.filter((pass) => pass.passKind === "session" && pass.sessionsLeft === 0),
      clientEmailQuality: buildClientEmailQualityReport([])
    }
  }

  const [salesResult, saleItemsResult, productsResult, passesResult, passTypesResult, expensesResult, clientsResult] =
    await Promise.all([
      client.database.from("sales").select("*").order("sold_at", { ascending: false }),
      client.database.from("sale_items").select("*"),
      client.database.from("products").select("*"),
      client.database.from("passes").select("*"),
      client.database.from("pass_types").select("*"),
      client.database.from("expenses").select("*").order("spent_on", { ascending: false }),
      client.database.from("clients").select("id,first_name,last_name,email")
    ])

  let portalAccountsResult: { data?: unknown; error?: unknown } | null = null
  try {
    portalAccountsResult = await client.database
      .from("client_portal_accounts")
      .select("client_id,auth_user_id,claimed_at,status")
  } catch {
    portalAccountsResult = null
  }

  if (
    salesResult.error ||
    !salesResult.data ||
    saleItemsResult.error ||
    !saleItemsResult.data ||
    productsResult.error ||
    !productsResult.data ||
    passesResult.error ||
    !passesResult.data ||
    passTypesResult.error ||
    !passTypesResult.data ||
    expensesResult.error ||
    !expensesResult.data ||
    clientsResult.error ||
    !clientsResult.data
  ) {
    throw new Error("No se pudieron cargar los informes")
  }

  const sales = (salesResult.data as Record<string, unknown>[]).filter((sale) => {
    const day = String(sale.sold_at ?? "").slice(0, 10)
    return String(sale.status ?? "posted") !== "void" && day >= from && day <= to
  })
  const saleIds = new Set(sales.map((sale) => String(sale.id)))
  const saleItems = (saleItemsResult.data as Record<string, unknown>[]).filter((item) => saleIds.has(String(item.sale_id)))
  const productsMap = new Map((productsResult.data as Record<string, unknown>[]).map((row) => [String(row.id), row]))
  const passesMap = new Map((passesResult.data as Record<string, unknown>[]).map((row) => [String(row.id), row]))
  const passTypesMap = new Map((passTypesResult.data as Record<string, unknown>[]).map((row) => [String(row.id), row]))
  const expenses = (expensesResult.data as Record<string, unknown>[]).filter((expense) => {
    const day = String(expense.spent_on ?? "")
    return day >= from && day <= to
  })
  const clientEmailQuality = buildClientEmailQualityReport(
    clientsResult.data as DbRow[],
    portalAccountsResult && !portalAccountsResult.error && Array.isArray(portalAccountsResult.data)
      ? (portalAccountsResult.data as DbRow[])
      : null
  )

  const salesByDate = sales.reduce<Record<string, number>>((acc, sale) => {
    const key = String(sale.sold_at ?? "").slice(0, 10)
    acc[key] = (acc[key] ?? 0) + Number(sale.total_gross ?? 0)
    return acc
  }, {})

  const salesByProduct = saleItems.reduce<Record<string, number>>((acc, item) => {
    if (String(item.item_type ?? "") !== "product" || !item.product_id) {
      return acc
    }

    const product = productsMap.get(String(item.product_id))
    const label = String(product?.name ?? item.description_snapshot ?? "Producto")
    acc[label] = (acc[label] ?? 0) + Number(item.line_total_gross ?? 0)
    return acc
  }, {})

  const salesByPassType = saleItems.reduce<Record<string, number>>((acc, item) => {
    if (String(item.item_type ?? "") !== "pass" || !item.pass_id) {
      return acc
    }

    const pass = passesMap.get(String(item.pass_id))
    const passType = pass ? passTypesMap.get(String(pass.pass_type_id ?? "")) : null
    const label = String(passType?.name ?? item.description_snapshot ?? "Bono")
    acc[label] = (acc[label] ?? 0) + Number(item.line_total_gross ?? 0)
    return acc
  }, {})

  const expensesByCategory = expenses.reduce<Record<string, number>>((acc, expense) => {
    const label = String(expense.category ?? "Sin categoría")
    acc[label] = (acc[label] ?? 0) + Number(expense.total_amount ?? 0)
    return acc
  }, {})

  const paymentMethodSplit = sales.reduce<Record<string, number>>((acc, sale) => {
    const label = formatPaymentMethod(String(sale.payment_method ?? "cash"))
    acc[label] = (acc[label] ?? 0) + Number(sale.total_gross ?? 0)
    return acc
  }, {})

  const lowStockProducts = (productsResult.data as Record<string, unknown>[]).filter(
    (product) => Number(product.stock_on_hand ?? 0) <= Number(product.min_stock ?? 0)
  )
  const expiringPasses = (passesResult.data as Record<string, unknown>[]).filter(
    (pass) => String(pass.status ?? "") === "active"
  )
  const noSessionPasses = (passesResult.data as Record<string, unknown>[]).filter(
    (pass) => pass.sessions_left !== null && Number(pass.sessions_left ?? 0) === 0
  )

  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.total_gross ?? 0), 0)
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.total_amount ?? 0), 0)

  return {
    from,
    to,
    totals: {
      sales: totalSales,
      expenses: totalExpenses,
      estimatedMargin: totalSales - totalExpenses
    },
    salesByDate: Object.entries(salesByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, amount]) => ({ label, amount })),
    salesByProduct: Object.entries(salesByProduct)
      .sort((a, b) => b[1] - a[1])
      .map(([label, amount]) => ({ label, amount })),
    salesByPassType: Object.entries(salesByPassType)
      .sort((a, b) => b[1] - a[1])
      .map(([label, amount]) => ({ label, amount })),
    expensesByCategory: Object.entries(expensesByCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([label, amount]) => ({ label, amount })),
    paymentMethodSplit: Object.entries(paymentMethodSplit)
      .sort((a, b) => b[1] - a[1])
      .map(([label, amount]) => ({ label, amount })),
    lowStockProducts: lowStockProducts.map((product) => ({
      id: String(product.id),
      name: String(product.name ?? ""),
      stockOnHand: Number(product.stock_on_hand ?? 0),
      minStock: Number(product.min_stock ?? 0)
    })),
    expiringPasses: expiringPasses.map((pass) => ({
      id: String(pass.id),
      expiresOn: String(pass.expires_on ?? ""),
      sessionsLeft: Number(pass.sessions_left ?? 0)
    })),
    noSessionPasses: noSessionPasses.map((pass) => ({
      id: String(pass.id),
      expiresOn: String(pass.expires_on ?? ""),
      sessionsLeft: Number(pass.sessions_left ?? 0)
    })),
    clientEmailQuality
  }
}
