// scripts/open-popup.mjs — attach to a running (remote-debugged) browser and open
// PrivacyMyst's popup. Usage: node scripts/open-popup.mjs [extId] [port]
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ID = process.argv[2] || "hbbclghlaaekliknnlhhillklflogcfj"
const PORT = process.argv[3] || "9333"
const url = `chrome-extension://${ID}/popup.html`

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
const ctx = browser.contexts()[0]
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
