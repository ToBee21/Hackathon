// scripts/demo-live.mjs
// Show off live: attach to the running demo browser (port 9333), open a REAL
// page, let the content script inject the floating window, expand the panel, and
// screenshot it over the real page. Leaves the tab open + foregrounded.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PORT = 9333
const URLS = [
  "https://en.wikipedia.org/wiki/Major_depressive_disorder",
  "https://en.wikipedia.org/wiki/Personal_bankruptcy",
  "https://example.com"
]

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
const context = browser.contexts()[0]
const page = await context.newPage()

let opened = ""
for (const url of URLS) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 })
    opened = url
    break
  } catch {
    /* try next */
  }
}
console.log("OPENED:", opened || "(none)")

try {
  await page.waitForSelector("#cloak-dagger-floating-root", { timeout: 12000 })
  // Give the scan a moment to compute the heuristic verdict + cards.
  await page.waitForTimeout(1200)
  const bubble = page.locator('[data-cloak-dagger="bubble"]')
  if (await bubble.count()) {
    console.log("BUBBLE BADGE:", (await bubble.textContent())?.trim())
    await bubble.click()
  }
  await page.locator('[data-cloak-dagger="panel"]').waitFor({ timeout: 8000 })
  const cards = await page.$$eval("[data-feature]", (els) =>
    els.map((e) => e.getAttribute("data-feature"))
  )
  const status = await page
    .locator('[data-cloak-dagger="model-status"]')
    .textContent()
  console.log("CARDS:", cards.join(", "))
  console.log("MODEL STATUS:", status?.trim())
  await page.bringToFront()
  await page.screenshot({ path: join(ROOT, "build", "demo-live.png") })
  console.log("SCREENSHOT: build/demo-live.png")
  console.log("LIVE: floating window is open on", opened)
} catch (err) {
  console.log("LIVE FAILED:", err?.message || String(err))
}

process.exit(0)
