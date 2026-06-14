// scripts/shot.mjs — screenshot the running PrivacyMyst popup for verification.
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ID = "hbbclghlaaekliknnlhhillklflogcfj"
const PORT = "9333"
const url = `chrome-extension://${ID}/popup.html`
const out = "build/popup-shot.png"

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
const ctx = browser.contexts()[0]
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
