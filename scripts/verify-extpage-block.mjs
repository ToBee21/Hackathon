// Empirical root-cause + fix proof for ERR_BLOCKED_BY_CLIENT on the extension's
// own pages. Loads the SHIPPED folder (D:\PrivacyMyst) in a clean isolated Edge
// and A/B tests a top-level navigation to tabs/dashboard.html:
//   BASELINE  : extension's own (now guarded) rules            -> expect LOAD
//   UNGUARDED : inject the OLD param-strip rule (no scheme)    -> expect BLOCK
//   GUARDED   : the fix (regexFilter ^https?://)               -> expect LOAD
//   STRIP     : guarded rule still removes utm_* on real http  -> expect stripped
// Screens the fixed dashboard + popup to docs/proof/.
import { createRequire } from "node:module"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { mkdir } from "node:fs/promises"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXT = process.env.EXT_DIR || "D:\\PrivacyMyst"
const OUT = join(ROOT, "docs", "proof")
const BROWSER_EXE =
  process.env.LLM_VERIFY_BROWSER_EXE ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const PROFILE = join(ROOT, "build", "privacymyst-blocktest-profile")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const server = createServer((q, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(`<!doctype html><meta charset=utf-8><h1>http fixture</h1><p id=u>${q.url}</p>`)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
await mkdir(OUT, { recursive: true })

const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid"]
const redirect = { transform: { queryTransform: { removeParams: PARAMS } } }
const ruleUnguarded = (id) => ({
  id, priority: 1, action: { type: "redirect", redirect },
  condition: { resourceTypes: ["main_frame", "sub_frame"] }
})
const ruleGuarded = (id) => ({
  id, priority: 1, action: { type: "redirect", redirect },
  condition: { regexFilter: "^https?://", resourceTypes: ["main_frame", "sub_frame"] }
})

let context
try {
  context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: BROWSER_EXE,
    headless: false,
    viewport: { width: 1120, height: 860 },
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`
    ],
    timeout: 60000
  })

  let sw
  for (let i = 0; i < 30 && !sw; i++) {
    sw =
      context.serviceWorkers().find((s) => s.url().includes("/static/background/")) ||
      context.serviceWorkers()[0]
    if (!sw) await sleep(1000)
  }
  if (!sw) throw new Error("no service worker")
  const extId = new URL(sw.url()).host
  const dash = `chrome-extension://${extId}/tabs/dashboard.html`

  const setRules = (add) =>
    sw.evaluate(async (add) => {
      const cur = await chrome.declarativeNetRequest.getDynamicRules()
      const mine = cur.filter((r) => r.id >= 990000).map((r) => r.id)
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [...mine, ...add.map((r) => r.id)],
        addRules: add
      })
      return (await chrome.declarativeNetRequest.getDynamicRules()).map((r) => r.id)
    }, add)

  const tryNav = async (url) => {
    const p = await context.newPage()
    let result
    try {
      const r = await p.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 })
      result = { ok: true, status: r?.status?.() ?? null, url: p.url() }
    } catch (e) {
      result = { ok: false, err: (e?.message || String(e)).split("\n")[0] }
    }
    return { p, result }
  }

  const report = []

  // BASELINE — extension's own (now guarded) default rules
  {
    const { p, result } = await tryNav(dash)
    report.push(["BASELINE dashboard (own guarded rules)", result])
    await p.close()
  }

  // UNGUARDED — inject the OLD rule shape; expect ERR_BLOCKED_BY_CLIENT
  await setRules([ruleUnguarded(990001)])
  await sleep(500)
  {
    const { p, result } = await tryNav(dash)
    report.push(["UNGUARDED rule -> dashboard", result])
    await p.close()
  }

  // GUARDED — the fix; expect load
  await setRules([ruleGuarded(990002)])
  await sleep(500)
  {
    const { p, result } = await tryNav(dash)
    report.push(["GUARDED rule -> dashboard", result])
    if (result.ok) {
      await sleep(700)
      await p.screenshot({ path: join(OUT, "05-dashboard-fixed.png") })
    }
    await p.close()
  }

  // STRIP — guarded rule still removes utm_* on real http
  {
    const { p, result } = await tryNav(`${base}/landing?utm_source=ad&utm_medium=cpc&keep=1`)
    const shown = (await p.locator("#u").textContent().catch(() => "")) || ""
    report.push([
      "GUARDED strips utm on http",
      { ...result, finalQuery: shown, stripped: !/utm_/.test(shown) && /keep=1/.test(shown) }
    ])
    await p.close()
  }

  // popup proof + cleanup my test rules
  await setRules([])
  {
    const { p, result } = await tryNav(`chrome-extension://${extId}/popup.html`)
    if (result.ok) {
      await sleep(700)
      await p.screenshot({ path: join(OUT, "06-popup-fixed.png") })
    }
    report.push(["popup", result])
    await p.close()
  }

  console.log("EXT_ID", extId)
  for (const [name, r] of report) console.log("RESULT", name, "::", JSON.stringify(r))
} catch (e) {
  console.log("FAIL", e?.stack || e?.message || String(e))
} finally {
  server.close()
  if (context) await Promise.race([context.close().catch(() => {}), sleep(8000)])
}
