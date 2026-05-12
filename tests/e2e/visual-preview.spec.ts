import { expect, test } from "@playwright/test"

test.describe("visual preview", () => {
  test("carga rutas staff sin login", async ({ page }) => {
    const routes = [
      { path: "/dashboard?preview=staff", text: "Panel" },
      { path: "/clients?preview=staff", text: "Clientes" },
      { path: "/agenda?preview=staff", text: "Agenda" },
      { path: "/reports?preview=staff", text: "Informes" },
      { path: "/settings?preview=staff", text: "Ajustes" }
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
    await expect(page.getByRole("heading", { name: "Pesos máximos" })).toBeVisible()
    await expect(page.getByLabel("Resumen de pesos máximos").getByText("45 kg")).toBeVisible()
    await expect(page.getByLabel("Resumen de pesos máximos").getByText("+2,5 kg")).toBeVisible()

    await page.getByRole("link", { name: "Editar cliente" }).click()
    await expect(page).toHaveURL(/\/clients\/c1\/edit/, { timeout: 15000 })
    await expect(page.getByRole("heading", { name: "Editar cliente" }).first()).toBeVisible()
  })

  test("carga rutas del portal cliente sin login", async ({ page }) => {
    const routes = [
      { path: "/cliente/dashboard?preview=cliente", text: "Actividad" },
      { path: "/cliente/agenda?preview=cliente", text: "Agenda" },
      { path: "/cliente/pesos-maximos?preview=cliente", text: "Evolución de pesos máximos" },
      { path: "/cliente/nutricion?preview=cliente", text: "Nutrición" },
      { path: "/cliente/ajustes?preview=cliente", text: "Ajustes" }
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

  test("muestra pesos maximos de solo lectura en dashboard cliente", async ({ page }) => {
    await page.goto("/cliente/dashboard?preview=cliente")

    await expect(page.getByRole("heading", { name: "Mis pesos máximos" })).toBeVisible()
    await expect(page.getByText("Pecho")).toBeVisible()
    await expect(page.getByText("45 kg").first()).toBeVisible()
    await expect(page.getByText("+2,5 kg desde", { exact: false })).toBeVisible()
    await expect(page.getByText("Hombro", { exact: true })).toHaveCount(0)
    await page.getByRole("link", { name: "Ver evolución" }).click()

    await expect(page).toHaveURL(/\/cliente\/pesos-maximos/)
    await expect(page.getByRole("heading", { name: "Evolución de pesos máximos" }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: /Guardar/i })).toHaveCount(0)
  })

  test("calcula resumen e historial de pesos maximos en detalle cliente", async ({ page }) => {
    await page.goto("/cliente/pesos-maximos?preview=cliente")

    await expect(page.getByText("Peso actual")).toBeVisible()
    await expect(page.getByText("Mejor marca")).toBeVisible()
    await expect(page.getByText("Progreso total")).toBeVisible()
    await expect(page.getByText("45 kg").first()).toBeVisible()
    await expect(page.getByText("+2,5 kg")).toBeVisible()
    await expect(page.getByRole("img", { name: "Evolución histórica de pesos máximos" })).toBeVisible()
    await expect(page.getByRole("cell", { name: "42,5 kg" })).toBeVisible()

    await page.getByRole("link", { name: "Espalda" }).click()
    await expect(page).toHaveURL(/metric=preview-strength-espalda/)
    await expect(page.getByText("55,5 kg").first()).toBeVisible()

    await page.getByRole("link", { name: "Hombro" }).click()
    await expect(page).toHaveURL(/metric=preview-strength-hombro/)
    await expect(page.getByText("18 kg").first()).toBeVisible()
  })

  test("muestra y valida configuracion de pesos maximos", async ({ page }) => {
    await page.goto("/settings?preview=staff")

    await expect(page.getByRole("heading", { name: "Pesos máximos" })).toBeVisible()
    await expect(page.locator('input[name="name"][value="Pecho"]')).toBeVisible()
    await expect(page.locator('input[name="name"][value="Espalda"]')).toBeVisible()
    await expect(page.locator('input[name="name"][value="Pierna"]')).toBeVisible()

    await page.getByRole("button", { name: "Añadir métrica" }).click()
    const newMetricForm = page.locator("form").filter({ has: page.locator("#new-strength-metric-name") })
    await newMetricForm.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText("El nombre es obligatorio.")).toBeVisible()

    await newMetricForm.getByLabel("Nombre").fill("Hombro")
    await newMetricForm.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText("Métrica guardada correctamente.")).toBeVisible()
  })

  test("permite editar y alternar actividad de una metrica de peso", async ({ page }) => {
    await page.goto("/settings?preview=staff")

    const row = page.locator("form").filter({ has: page.locator('input[name="name"][value="Pecho"]') }).first()
    await row.getByLabel("Nombre").fill("Press banca")
    await row.getByLabel("Activa").uncheck()
    await expect(row.getByLabel("Activa")).not.toBeChecked()
    await row.getByRole("button", { name: "Guardar" }).click()

    await expect(page.getByText("Métrica guardada correctamente.")).toBeVisible()
  })

  test("valida y guarda registros parciales de pesos maximos", async ({ page }) => {
    await page.goto("/clients/c1?preview=staff")

    await page.getByLabel("Pecho").fill("-1")
    await page.getByRole("button", { name: "Guardar registro" }).click()
    await expect(page.getByText("El peso no puede ser negativo.")).toBeVisible()

    await page.getByLabel("Pecho").fill("45,55")
    await page.getByRole("button", { name: "Guardar registro" }).click()
    await expect(page.getByText("Solo se permite un decimal.")).toBeVisible()

    await page.getByLabel("Pecho").fill("46,5")
    await page.getByLabel("Pierna").fill("80")
    await page.getByRole("button", { name: "Guardar registro" }).click()
    await expect(page.getByText("Registro guardado correctamente.")).toBeVisible()
  })

  test("cambia la metrica seleccionada en grafica e historial de pesos", async ({ page }) => {
    await page.goto("/clients/c1?preview=staff")

    await page.getByLabel("Métrica").selectOption({ label: "Espalda" })
    await expect(page.getByRole("img", { name: "Evolución histórica de pesos máximos" })).toBeVisible()
    await expect(page.getByRole("cell", { name: "55,5 kg" })).toBeVisible()

    await page.getByLabel("Métrica").selectOption({ label: "Hombro (inactiva)" })
    await expect(page.getByRole("cell", { name: "18 kg" })).toBeVisible()
  })

  test("abre planes guardados desde el asistente flotante", async ({ page }) => {
    await page.goto("/cliente/dashboard?preview=cliente")
    await page.getByRole("button", { name: "Asistente Nutricional" }).click()
    await page.getByRole("link", { name: "Ver planes guardados" }).click()

    await expect(page).toHaveURL(/\/cliente\/nutricion#menu-semanal$/)
    await expect(page.locator("#menu-semanal")).toBeVisible()
  })
})
