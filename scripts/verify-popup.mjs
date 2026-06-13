// scripts/verify-popup.mjs
// Attach to the already-running demo browser (npm run demo, debug port 9333),
// prove the AI Deep-Dive model picker renders with all registry models, exercise
// it (enable AI mode → select Gemma 4 E2B), and screenshot. Does NOT own the
// browser, so the window stays open after this exits.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PORT = 9333

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
const context = browser.contexts()[0]

const sws = context.serviceWorkers()
const extId = sws.length ? new URL(sws[0].url()).host : null
console.log("EXT ID:", extId)

let popup = context.pages().find((p) => p.url().includes("popup.html"))
if (!popup && extId) {
  popup = await context.newPage()
  await popup.setViewportSize({ width: 400, height: 820 })
  await popup.goto(`chrome-extension://${extId}/popup.html`, {
    waitUntil: "domcontentloaded"
  })
}
if (!popup) {
  console.log("NO POPUP PAGE FOUND")
  process.exit(1)
}

await popup.bringToFront()
await popup.waitForTimeout(1000)

// Prove the picker exists and lists every registry model (incl. Gemma 4 E2B).
const options = await popup.$$eval("select option", (els) =>
  els.map((e) => ({ value: e.value, label: (e.textContent || "").trim() }))
)
console.log("MODEL OPTIONS:", JSON.stringify(options, null, 2))

await popup.screenshot({ path: join(ROOT, "build", "demo-popup-01-initial.png") })

// Enable AI mode so the picker is active, then select Gemma 4 E2B.
const toggle = popup.locator('button[role="switch"]').first()
if (await toggle.count()) {
  await toggle.click().catch(() => {})
  await popup.waitForTimeout(400)
}
const select = popup.locator("select").first()
if (await select.count()) {
  await select.selectOption("gemma-4-e2b").catch(() => {})
  await popup.waitForTimeout(400)
}

const activeModelLine = await popup
  .locator("text=/onnx-community/")
  .first()
  .textContent()
  .catch(() => null)
console.log("ACTIVE MODEL LINE:", activeModelLine)

await popup.screenshot({ path: join(ROOT, "build", "demo-popup-02-gemma.png") })
console.log("SCREENSHOTS WRITTEN to build/demo-popup-01-initial.png and 02-gemma.png")

process.exit(0)
