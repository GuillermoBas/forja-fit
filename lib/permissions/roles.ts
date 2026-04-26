export type AppRole = "admin" | "trainer"

export function isAdmin(role?: AppRole | null) {
  return role === "admin"
}

export function canManageSettings(role?: AppRole | null) {
  return role === "admin"
}

export function canAddStock(role?: AppRole | null) {
  return role === "admin"
}

export function canVoidSales(role?: AppRole | null) {
  return role === "admin"
}

export function canEditPrices(role?: AppRole | null) {
  return role === "admin"
}
