import { chromium } from "@playwright/test"
import { fileURLToPath } from "node:url"
import { dirname, resolve, join } from "node:path"
import { mkdirSync } from "node:fs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const OUT = join(ROOT, "build")
mkdirSync(OUT, { recursive: true })
const fileUrl = "file:///" + join(ROOT, "site-launch", "privacymyst", "index.html").replace(/\\/g, "/")

const browser = await chromium.launch({ channel: "msedge", headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const reqs = []
page.on("request", (r) => { const u = r.url(); if (!u.startsWith("file:")) reqs.push(u) })

await page.goto(fileUrl, { waitUntil: "networkidle" })
await page.addStyleTag({ content: ".reveal{opacity:1!important;transform:none!important}" })
await page.waitForTimeout(1500) // mist canvas + fonts

// hero
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(400)
await page.screenshot({ path: join(OUT, "pm-hero.png") })

// demo (scroll in, let the simulated block-feed populate)
await page.evaluate(() => document.getElementById("demo").scrollIntoView())
await page.waitForTimeout(4200)
await page.locator("#demo .demo-shell").screenshot({ path: join(OUT, "pm-demo.png") })

// features + trust
await page.evaluate(() => document.getElementById("features").scrollIntoView())
await page.waitForTimeout(800)
await page.screenshot({ path: join(OUT, "pm-features.png") })

// full page
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(300)
await page.screenshot({ path: join(OUT, "pm-full.png"), fullPage: true })

console.log("NON-FILE (external) requests during render:", reqs.length === 0 ? "NONE (fully offline)" : JSON.stringify(reqs))
console.log("shots: build/pm-hero.png pm-demo.png pm-features.png pm-full.png")
await browser.close()
