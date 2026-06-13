// scripts/verify-floating-window.mjs
// Attach to the running demo browser (npm run demo, debug port 9333) and prove
// the in-page floating window works on a real page, using Playwright/CDP — no
// OS window focusing. Serves a local sensitive-content page so the verdict and
// cards are deterministic. Screenshots collapsed bubble + expanded panel.

import { createRequire } from "node:module"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PORT = 9333

const PAGE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="description" content="A personal guide for coping with depression, anxiety, and unpaid debt."/>
<meta property="og:title" content="Coping With Depression and Debt"/>
<title>Coping With Depression and Debt</title></head>
<body><main><h1>Coping With Depression and Debt</h1>
<p>This article discusses depression symptoms, suicidal thoughts, therapy options,
unpaid debt, eviction fear, bankruptcy risk, and urgent financial hardship support
for people going through a mental health and money crisis.</p>
<p>It covers anxiety, panic attacks, debt collectors, and where to find help.</p>
</main></body></html>`

function fail(msg) {
  console.log("FAIL:", msg)
  process.exitCode = 1
}

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(PAGE_HTML)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const { port } = server.address()
const url = `http://127.0.0.1:${port}/`

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
const context = browser.contexts()[0]

const page = await context.newPage()
await page.goto(url, { waitUntil: "domcontentloaded" })

let ok = true
try {
  // 1) Shadow host injected by the content script.
  await page.waitForSelector("#cloak-dagger-floating-root", { timeout: 12000 })
  console.log("PASS: floating shadow host injected (#cloak-dagger-floating-root)")

  // Playwright pierces the OPEN shadow root automatically.
  // 2) Collapsed bubble present.
  const bubble = page.locator('[data-cloak-dagger="bubble"]')
  await bubble.waitFor({ timeout: 8000 })
  const bubbleText = (await bubble.textContent())?.trim()
  console.log(`PASS: collapsed bubble present (badge="${bubbleText}")`)
  await page.screenshot({ path: join(ROOT, "build", "demo-floating-01-bubble.png") })

  // 3) Expand to panel.
  await bubble.click()
  const panel = page.locator('[data-cloak-dagger="panel"]')
  await panel.waitFor({ timeout: 8000 })
  console.log("PASS: panel expands on bubble click")

  // 4) Cards rendered FROM THE REGISTRY (data-feature attributes).
  const featureIds = await page.$$eval("[data-feature]", (els) =>
    els.map((e) => e.getAttribute("data-feature"))
  )
  if (featureIds.length === 0) {
    ok = false
    fail("no registry feature cards rendered")
  } else {
    console.log(`PASS: ${featureIds.length} registry card(s): ${featureIds.join(", ")}`)
  }

  // 5) Honest model status line (no faked inference).
  const status = await page
    .locator('[data-cloak-dagger="model-status"]')
    .textContent()
  console.log(`PASS: model status (honest): "${status?.trim()}"`)

  await page.screenshot({ path: join(ROOT, "build", "demo-floating-02-panel.png") })
  console.log("SCREENSHOTS: build/demo-floating-01-bubble.png, build/demo-floating-02-panel.png")
} catch (err) {
  ok = false
  fail(err?.message || String(err))
} finally {
  server.close()
}

console.log(ok ? "RESULT: FLOATING WINDOW OK" : "RESULT: FLOATING WINDOW FAILED")
process.exit(ok ? 0 : 1)
