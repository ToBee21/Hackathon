// Attach to the OFFSCREEN document via raw CDP (Target domain, flatten) and
// capture its console + exceptions + crash while a deep scan runs for a given
// model. The normal verify can't see the offscreen target; this can. Use to find
// why a model (e.g. qwen) crashes the offscreen where another (gemma) succeeds.
//
//   node scripts/diag-offscreen-cdp.mjs <modelId>

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

const attached = new Set()
let context

function fmtArgs(args = []) {
  return args
    .map((a) => {
      if (a.value !== undefined) return String(a.value)
      if (a.description) return a.description
      if (a.unserializableValue) return String(a.unserializableValue)
      return a.type || "?"
    })
    .join(" ")
}

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

  // Browser-level CDP session so we can see ALL targets, including the offscreen
  // document (which Playwright does not surface as a page).
  const root = await context.newCDPSession(await context.newPage())
  await root.send("Target.setDiscoverTargets", { discover: true })
  await root.send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true
  })

  const onTarget = async (info) => {
    const u = info.url || ""
    if (!u.includes("offscreen")) return
    if (attached.has(info.targetId)) return
    attached.add(info.targetId)
    console.log("OFFSCREEN TARGET:", u, "type=" + info.type)
    try {
      const { sessionId } = await root.send("Target.attachToTarget", {
        targetId: info.targetId,
        flatten: true
      })
      const send = (method, params) =>
        root.send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({ id: Date.now() % 1e6, method, params })
        }).catch(() => {})
      // Enable domains on the offscreen session.
      await send("Runtime.enable")
      await send("Log.enable")
      console.log("ATTACHED to offscreen session", sessionId)
    } catch (e) {
      console.log("attach error", e?.message || e)
    }
  }

  root.on("Target.targetCreated", ({ targetInfo }) => onTarget(targetInfo))
  root.on("Target.targetInfoChanged", ({ targetInfo }) => onTarget(targetInfo))
  root.on("Target.targetCrashed", (p) =>
    console.log("!!! Target.targetCrashed", JSON.stringify(p))
  )

  // Flattened protocol: events from attached sessions arrive on root with a
  // sessionId; Playwright re-emits them as plain CDP events too. Listen broadly.
  root.on("Runtime.consoleAPICalled", (e) =>
    console.log(`[OFFSCREEN console.${e.type}]`, fmtArgs(e.args))
  )
  root.on("Runtime.exceptionThrown", (e) =>
    console.log(
      "[OFFSCREEN EXCEPTION]",
      e?.exceptionDetails?.exception?.description ||
        e?.exceptionDetails?.text ||
        JSON.stringify(e)
    )
  )
  root.on("Log.entryAdded", (e) =>
    console.log(`[OFFSCREEN log.${e.entry?.level}]`, e.entry?.text)
  )
  // Raw fallback: some builds deliver attached-target events wrapped.
  root.on("Target.receivedMessageFromTarget", ({ message }) => {
    try {
      const m = JSON.parse(message)
      if (m.method === "Runtime.consoleAPICalled")
        console.log(`[OFFSCREEN console.${m.params.type}]`, fmtArgs(m.params.args))
      else if (m.method === "Runtime.exceptionThrown")
        console.log(
          "[OFFSCREEN EXCEPTION]",
          m.params?.exceptionDetails?.exception?.description ||
            m.params?.exceptionDetails?.text
        )
      else if (m.method === "Log.entryAdded")
        console.log(`[OFFSCREEN log.${m.params.entry?.level}]`, m.params.entry?.text)
    } catch {}
  })

  // Ext id.
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
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[testpage error]", m.text())
  })
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

  await sleep(RUN_MS)
  console.log("--- run window elapsed ---")
} catch (e) {
  console.log("FAIL:", e?.stack || e?.message || String(e))
} finally {
  server.close()
  if (context) await Promise.race([context.close().catch(() => {}), sleep(8000)])
}
