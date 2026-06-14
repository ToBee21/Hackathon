// Capture the OFFSCREEN document's own console/errors during a deep scan.
// The normal verify only sees the test page; the offscreen is a separate target,
// so a hard crash there shows up only as "message port closed". This attaches to
// EVERY page/worker target (incl. the offscreen document) and prints its console
// + pageerror + crash, so we see the real failure for a given model.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { createServer } from "node:http"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXT = join(ROOT, "build", "chrome-mv3-prod")
const BROWSER_EXE =
  process.env.LLM_VERIFY_BROWSER_EXE ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const PROFILE = join(ROOT, "build", "llm-verify-profile")
const MODEL = process.argv[2] || "qwen3-5-08b"
const RUN_MS = Number(process.env.DIAG_MS || 120000)
const CONFIG_KEY = "cnd:ai-deep-dive:config"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PAGE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="description" content="Coping with depression, eviction, bankruptcy and urgent debt support."/>
<title>Coping With Depression and Debt</title></head>
<body><main><h1>Coping With Depression and Debt</h1>
<p>This article discusses depression symptoms, suicidal thoughts, therapy, unpaid debt,
debt collectors, eviction fear, bankruptcy risk, urgent financial hardship support.</p>
</main></body></html>`

const server = createServer((_q, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(PAGE_HTML)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const url = `http://127.0.0.1:${server.address().port}/`

function wire(target, label) {
  try {
    target.on?.("console", (m) =>
      console.log(`[${label}:console:${m.type()}]`, m.text())
    )
    target.on?.("pageerror", (e) =>
      console.log(`[${label}:pageerror]`, e?.message || String(e))
    )
    target.on?.("crash", () => console.log(`[${label}:CRASH]`))
    target.on?.("close", () => console.log(`[${label}:close]`))
  } catch {}
}

let context
try {
  context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: BROWSER_EXE,
    headless: false,
    viewport: { width: 1000, height: 800 },
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`
    ],
    timeout: 60000
  })

  // Wire every existing + future page (the offscreen document shows up here too).
  for (const p of context.pages()) wire(p, "page:" + p.url().slice(0, 40))
  context.on("page", (p) => {
    const u = p.url()
    wire(p, "NEWPAGE:" + u.slice(0, 60))
    console.log("NEW PAGE TARGET:", u)
  })
  for (const sw of context.serviceWorkers()) wire(sw, "sw")
  context.on("serviceworker", (sw) => wire(sw, "sw"))

  // Find ext id.
  let extId = ""
  for (let i = 0; i < 25 && !extId; i++) {
    const sw =
      context.serviceWorkers().find((s) => s.url().includes("/static/background/")) ||
      context.serviceWorkers()[0]
    if (sw) extId = new URL(sw.url()).host
    else await sleep(1000)
  }
  console.log("EXT ID:", extId, "MODEL:", MODEL)

  const ext = await context.newPage()
  await ext.goto(`chrome-extension://${extId}/popup.html`, {
    waitUntil: "domcontentloaded"
  })
  await ext.evaluate(
    ({ configKey, model }) =>
      new Promise((res) => {
        chrome.storage.local.set(
          {
            [configKey]: {
              aiModeEnabled: true,
              selectedModelId: model,
              nliMinHeuristicScore: 25,
              maxSnippetChars: 2500
            }
          },
          () => res()
        )
      }),
    { configKey: CONFIG_KEY, model: MODEL }
  )

  const page = await context.newPage()
  wire(page, "testpage")
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("#cloak-dagger-floating-root", {
    state: "attached",
    timeout: 30000
  })
  await page.locator('[data-cloak-dagger="bubble"]').click()
  await page.locator('[data-cloak-dagger="panel"]').waitFor({ timeout: 10000 })
  await page.getByText("Skanuj ponownie").click()
  await sleep(800)
  console.log("--- clicking Głęboki skan (model=" + MODEL + ") ---")
  await page.getByText("Głęboki skan").click()

  // Periodically enumerate targets so we SEE the offscreen document appear.
  const started = Date.now()
  let seen = new Set()
  while (Date.now() - started < RUN_MS) {
    for (const p of context.pages()) {
      const u = p.url()
      if (!seen.has(u)) {
        seen.add(u)
        console.log("TARGET PRESENT:", u)
        if (u.includes("offscreen")) wire(p, "OFFSCREEN")
      }
    }
    await sleep(1500)
  }
} catch (e) {
  console.log("FAIL:", e?.stack || e?.message || String(e))
} finally {
  server.close()
  if (context) await Promise.race([context.close().catch(() => {}), sleep(8000)])
}
