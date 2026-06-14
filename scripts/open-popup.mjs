// scripts/open-popup.mjs — attach to a running (remote-debugged) browser and open
// PrivacyMyst's popup. The extension id is auto-resolved from the live install
// (never hardcoded — a baked-in id points at a stale/dead extension after rebuild).
// Usage: node scripts/open-popup.mjs [extId] [port]   (both optional)
import { createRequire } from "node:module"
import { resolveExtId } from "./_ext-id.mjs"
const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const PORT = process.argv[3] || process.env.CND_DEMO_PORT || "9333"

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
const ctx = browser.contexts()[0]
const ID = await resolveExtId(ctx, PORT, process.argv[2])
const url = `chrome-extension://${ID}/popup.html`

let pg = ctx.pages().find((p) => p.url() === url)
if (!pg) {
  pg = await ctx.newPage()
  await pg.goto(url, { waitUntil: "domcontentloaded" })
}
await pg.setViewportSize({ width: 400, height: 820 }).catch(() => {})
await pg.bringToFront()
// quick sanity: is the dashboard root present?
const hasConsole = await pg
  .evaluate(() => Boolean(document.querySelector(".console")))
  .catch(() => false)
console.log(`OPENED ${url} | dashboard mounted: ${hasConsole}`)
process.exit(0)
