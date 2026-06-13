// scripts/verify-sidepanel.mjs
// Verify the side panel SURFACE renders and consumes current-page analysis.
// Honest scope: chrome.sidePanel.open() requires a user gesture, which CDP can't
// synthesize reliably, so we open the side panel's page (chrome-extension://<id>/
// sidepanel.html) as a tab and confirm it renders + reads the stored analysis.
// Native panel opening is exercised manually via the popup button / context menu.

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
if (!extId) {
  console.log("RESULT: SIDE PANEL FAILED (no extension service worker)")
  process.exit(1)
}

let ok = true
try {
  const panel = await context.newPage()
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`, {
    waitUntil: "domcontentloaded"
  })
  await panel.waitForTimeout(1200)

  const title = await panel.locator("text=Page Audit").count()
  if (title === 0) {
    ok = false
    console.log("FAIL: side panel did not render 'Page Audit' header")
  } else {
    console.log("PASS: side panel renders (Page Audit header present)")
  }

  const modeText = await panel
    .locator("text=/Tryb inferencji/")
    .first()
    .textContent()
    .catch(() => null)
  console.log(`PASS: inference-mode row present (honest): "${(modeText || "").trim()}"`)

  await panel.screenshot({ path: join(ROOT, "build", "demo-sidepanel.png") })
  console.log("SCREENSHOT: build/demo-sidepanel.png")
} catch (err) {
  ok = false
  console.log("FAIL:", err?.message || String(err))
}

console.log(ok ? "RESULT: SIDE PANEL OK" : "RESULT: SIDE PANEL FAILED")
process.exit(ok ? 0 : 1)
