import { expect, test } from "@playwright/test"

test.describe("visual preview", () => {
  test("carga rutas staff sin login", async ({ page }) => {
    const routes = [
      { path: "/dashboard?preview=staff", text: "Panel" },
      { path: "/clients", text: "Clientes" },
      { path: "/agenda", text: "Agenda" },
      { path: "/reports", text: "Informes" },
      { path: "/settings", text: "Ajustes" }
    ]

    for (const route of routes) {
      await page.goto(route.path)
      await expect(page).not.toHaveURL(/\/login/)
      await expect(page.getByText(route.text, { exact: false }).first()).toBeVisible()
    }
  })

  test("carga detalle y edicion de cliente con ruta dinamica", async ({ page }) => {
    await page.goto("/clients/c1?preview=staff")
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByRole("heading", { name: "Lucia Moreno" })).toBeVisible()

    await page.getByRole("link", { name: "Editar cliente" }).click()
    await expect(page).toHaveURL(/\/clients\/c1\/edit/, { timeout: 15000 })
    await expect(page.getByRole("heading", { name: "Editar cliente" }).first()).toBeVisible()
  })

  test("carga rutas del portal cliente sin login", async ({ page }) => {
    const routes = [
      { path: "/cliente/dashboard?preview=cliente", text: "Actividad" },
      { path: "/cliente/agenda", text: "Agenda" },
      { path: "/cliente/nutricion", text: "Nutrición" },
      { path: "/cliente/ajustes", text: "Ajustes" }
    ]

    for (const route of routes) {
      await page.goto(route.path)
      await expect(page).not.toHaveURL(/\/cliente\/login/)
      await expect(page.getByText(route.text, { exact: false }).first()).toBeVisible()
    }
  })

  test("mantiene scroll funcional con menu inferior en movil y tablet", async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 893, height: 938 }
    ]) {
      await page.setViewportSize(viewport)
      await page.goto("/cliente/dashboard?preview=cliente")

      const bottomNav = page.locator(".portal-mobile-bottom-nav")
      await expect(bottomNav).toBeVisible()

      const result = await page.locator(".portal-mobile-scroll-region").evaluate((element) => {
        const before = element.scrollTop
        element.scrollTop = 600
        return {
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          before,
          after: element.scrollTop
        }
      })

      expect(result.scrollHeight).toBeGreaterThan(result.clientHeight)
      expect(result.after).toBeGreaterThan(result.before)

      const navBox = await bottomNav.boundingBox()
      const scrollBox = await page.locator(".portal-mobile-scroll-region").boundingBox()
      expect(navBox).not.toBeNull()
      expect(scrollBox).not.toBeNull()
      expect(scrollBox!.y + scrollBox!.height).toBeLessThanOrEqual(navBox!.y + 1)
    }
  })

  test("oculta menu inferior en desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/cliente/dashboard?preview=cliente")
    await expect(page.locator(".portal-mobile-bottom-nav")).toBeHidden()
  })

  test("mantiene activo el rango de actividad seleccionado", async ({ page }) => {
    await page.goto("/cliente/dashboard?preview=cliente")
    const range90 = page.locator('a[href*="range=90"]').first()
    await range90.click()

    await expect(page).toHaveURL(/range=90/)
    await expect(page.locator('a[href*="range=90"]').first()).toHaveAttribute("aria-current", "page")
  })

  test("abre planes guardados desde el asistente flotante", async ({ page }) => {
    await page.goto("/cliente/dashboard?preview=cliente")
    await page.getByRole("button", { name: "Asistente Nutricional" }).click()
    await page.getByRole("link", { name: "Ver planes guardados" }).click()

    await expect(page).toHaveURL(/\/cliente\/nutricion#menu-semanal$/)
    await expect(page.locator("#menu-semanal")).toBeVisible()
  })
})
