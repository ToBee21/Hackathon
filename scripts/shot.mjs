// scripts/shot.mjs — screenshot the running PrivacyMyst popup for verification.
// The extension id is auto-resolved from the live install (never hardcoded).
// Usage: node scripts/shot.mjs [extId] [port]   (both optional)
import { createRequire } from "node:module"
import { resolveExtId } from "./_ext-id.mjs"
const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const PORT = process.argv[3] || process.env.CND_DEMO_PORT || "9333"
const out = "build/popup-shot.png"

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
const ctx = browser.contexts()[0]
const ID = await resolveExtId(ctx, PORT, process.argv[2])
const url = `chrome-extension://${ID}/popup.html`

let pg = ctx.pages().find((p) => p.url() === url)
if (!pg) {
  pg = await ctx.newPage()
  await pg.goto(url, { waitUntil: "domcontentloaded" })
}
await pg.setViewportSize({ width: 380, height: 900 })
await new Promise((r) => setTimeout(r, 1500)) // let animations settle
await pg.screenshot({ path: out })
const cards = await pg.evaluate(() => ({
  console: !!document.querySelector(".console"),
  score: document.body.innerText.includes("Privacy Score"),
  radar: !!document.querySelector("canvas"),
  shadow: document.body.innerText.includes("cyfrowy"),
  honeypotToggle: document.body.innerText.includes("Honeypot"),
  ai: document.body.innerText.toLowerCase().includes("deep")
}))
console.log("SHOT", out, JSON.stringify(cards))
process.exit(0)
