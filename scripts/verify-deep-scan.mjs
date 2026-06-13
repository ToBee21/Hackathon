// scripts/verify-deep-scan.mjs
// Prove REAL on-device inference end-to-end via the offscreen document. Selects
// the light NLI model (~180 MB, actually downloadable in a demo), enables AI
// mode, opens a sensitive page, expands the floating panel, clicks "Głęboki
// skan", and waits until the AI Profiling card's source flips heuristic -> nli.
// First run downloads the model, so the timeout is generous.

import { createRequire } from "node:module"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PORT = 9333

const PAGE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="description" content="Coping with depression, anxiety and unpaid debt."/>
<title>Coping With Depression and Debt</title></head>
<body><main><h1>Coping With Depression and Debt</h1>
<p>This article discusses depression symptoms, suicidal thoughts, therapy, unpaid
debt, eviction fear, bankruptcy risk and urgent financial hardship support.</p>
</main></body></html>`

const server = createServer((_q, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(PAGE_HTML)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const url = `http://127.0.0.1:${server.address().port}/`

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
const context = browser.contexts()[0]
const extId = context.serviceWorkers().length
  ? new URL(context.serviceWorkers()[0].url()).host
  : null
console.log("EXT ID:", extId)

let ok = false
try {
  // 1) Configure: enable AI mode + select the light NLI model (storage write
  //    from an extension page context).
  const cfgPage = await context.newPage()
  await cfgPage.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "domcontentloaded" })
  await cfgPage.evaluate(
    () =>
      new Promise((r) =>
        chrome.storage.local.set(
          {
            "cnd:ai-deep-dive:config": {
              aiModeEnabled: true,
              selectedModelId: "nli-deberta-small",
              nliMinHeuristicScore: 25,
              maxSnippetChars: 2500
            }
          },
          () => r()
        )
      )
  )
  console.log("CONFIG: aiModeEnabled=true, model=nli-deberta-small")

  // 2) Open the sensitive page; floating window mounts.
  const page = await context.newPage()
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("#cloak-dagger-floating-root", { timeout: 12000 })
  const bubble = page.locator('[data-cloak-dagger="bubble"]')
  await bubble.waitFor({ timeout: 8000 })
  await bubble.click()
  await page.locator('[data-cloak-dagger="panel"]').waitFor({ timeout: 8000 })

  // 3) Refresh config in the panel (re-scan picks up the new storage config),
  //    then trigger the deep scan.
  await page.getByText("Skanuj ponownie").click()
  await page.waitForTimeout(800)
  const sourceBefore = await page
    .locator('[data-feature="ai-profiling-detector"] .src')
    .textContent()
  console.log("SOURCE BEFORE:", sourceBefore?.trim())

  await page.getByText("Głęboki skan").click()
  console.log("Clicked deep scan — downloading + running NLI in offscreen…")

  // 4) Wait for the card source to flip to nli (real inference happened).
  const deadline = Date.now() + 240000
  let flipped = false
  let lastStatus = ""
  while (Date.now() < deadline) {
    const src = (
      await page.locator('[data-feature="ai-profiling-detector"] .src').textContent().catch(() => "")
    )?.trim()
    const status = (
      await page.locator('[data-cloak-dagger="model-status"]').textContent().catch(() => "")
    )?.trim()
    if (status && status !== lastStatus) {
      console.log("STATUS:", status)
      lastStatus = status
    }
    if (src && /nli/i.test(src)) {
      flipped = true
      console.log("SOURCE AFTER:", src)
      break
    }
    if (status && /Błąd modelu/i.test(status)) {
      console.log("MODEL ERROR:", status)
      break
    }
    await page.waitForTimeout(2000)
  }

  await page.screenshot({ path: join(ROOT, "build", "demo-deepscan.png") })
  console.log("SCREENSHOT: build/demo-deepscan.png")
  ok = flipped
} catch (err) {
  console.log("FAIL:", err?.message || String(err))
} finally {
  server.close()
}

console.log(ok ? "RESULT: LIVE NLI INFERENCE OK" : "RESULT: LIVE INFERENCE NOT CONFIRMED")
process.exit(ok ? 0 : 1)
