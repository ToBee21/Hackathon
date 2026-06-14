import { test, expect } from "@playwright/test"
import deck from "../src/story/deck.story.json"

// Smoke + visual regression: every section renders and is non-empty.
test.describe("PrivacyMyst deck", () => {
  test("renders all sections with a thesis", async ({ page }) => {
    await page.goto("/?reduced=1", { waitUntil: "networkidle" })
    await expect(page.locator(".display").first()).toBeVisible()
    for (const s of deck.sections) {
      await expect(page.locator(`[data-section="${s.id}"]`)).toHaveCount(1)
    }
  })

  test("architecture diagram + graph mount", async ({ page }) => {
    await page.goto("/?reduced=1", { waitUntil: "networkidle" })
    await page.locator('[data-section="architecture"]').scrollIntoViewIfNeeded()
    await expect(page.locator(".mermaid-host svg")).toBeVisible({ timeout: 8000 })
    await page.locator('[data-section="engine"]').scrollIntoViewIfNeeded()
    await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 8000 })
  })

  test("hero visual snapshot", async ({ page }) => {
    await page.goto("/?reduced=1", { waitUntil: "networkidle" })
    await page.waitForTimeout(600)
    await expect(page).toHaveScreenshot("hero.png", { fullPage: false })
  })
})
