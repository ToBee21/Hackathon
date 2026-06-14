// scripts/launch-demo.mjs
// Launch the BUILT PrivacyMyst extension in a real browser and open the popup
// dashboard. Strategy: spawn the browser DETACHED with a remote-debugging port
// (so the window survives after this script exits), then attach over CDP to find
// the extension and open its popup. Prefers Edge (still honours --load-extension;
// recent Chrome often ignores it). Run: `npm run demo` (after `npm run build`).

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { access, appendFile, mkdir, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXT = join(ROOT, "build", "chrome-mv3-prod")
const LOG = join(ROOT, "build", "demo-launch.log")
const PORT = 9333
const DEMO_PROFILE =
  process.env.CND_DEMO_PROFILE || join(ROOT, "build", "llm-demo-profile")

// Edge first — recent Chrome silently ignores --load-extension.
const BROWSER_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROME_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`
  console.log(msg)
  try {
    await appendFile(LOG, msg + "\n")
  } catch {}
}

async function resolveBrowser() {
  for (const c of BROWSER_CANDIDATES) {
    try {
      await access(c)
      return c
    } catch {}
  }
  throw new Error("No Chrome or Edge found. Set PLAYWRIGHT_CHROME_PATH.")
}

async function devtoolsUp() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
    return r.ok
  } catch {
    return false
  }
}

async function listTargets() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    return r.ok ? await r.json() : []
  } catch {
    return []
  }
}

async function main() {
  await mkdir(join(ROOT, "build"), { recursive: true }).catch(() => {})
  await writeFile(LOG, "").catch(() => {})

  await access(join(EXT, "manifest.json")).catch(() => {
    throw new Error(`No build at ${EXT}. Run 'npm run build' first.`)
  })

  const exe = await resolveBrowser()
  const userDataDir = DEMO_PROFILE
  await log(`Browser: ${exe}`)
  await log(`Extension: ${EXT}`)
  await log(`Profile: ${userDataDir}`)

  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--start-maximized",
    "https://example.com"
  ]

  const child = spawn(exe, args, { detached: true, stdio: "ignore" })
  child.unref()
  await log(`Spawned detached browser (pid ${child.pid}) on debug port ${PORT}`)

  // Wait for the DevTools endpoint.
  for (let i = 0; i < 30 && !(await devtoolsUp()); i++) await sleep(1000)
  if (!(await devtoolsUp())) {
    await log("DevTools endpoint never came up — is the browser blocked by policy?")
    process.exit(1)
  }
  await log("DevTools endpoint is up.")

  // Attach over CDP (does NOT own the browser, so it stays open on disconnect).
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`)
  const context = browser.contexts()[0]

  // Diagnostic: dump targets + content-script load proof.
  // Pick OUR extension, not a browser built-in: our Plasmo service worker lives
  // at chrome-extension://<id>/static/background/index.js.
  let extId = null
  for (let i = 0; i < 25 && !extId; i++) {
    const targets = await listTargets()
    const ours =
      targets.find((t) => String(t.url || "").includes("/static/background/")) ||
      targets.find(
        (t) =>
          t.type === "service_worker" &&
          String(t.url || "").startsWith("chrome-extension://")
      )
    if (ours) extId = new URL(ours.url).host
    if (!extId) {
      const sws = context.serviceWorkers?.() || []
      const sw = sws.find((s) => s.url().includes("/static/background/")) || sws[0]
      if (sw) extId = new URL(sw.url()).host
    }
    if (!extId) await sleep(1200)
  }

  // Proof the extension actually loaded: content-script install flag on the page.
  try {
    const pages = context.pages()
    const pg = pages.find((p) => p.url().includes("example.com")) || pages[0]
    if (pg) {
      const installed = await pg.evaluate(
        () => Boolean(window.__cloakDaggerBionicBlurInstalled)
      )
      await log(`Content-script (Bionic Blur) installed on page: ${installed}`)
    }
  } catch {}

  if (!extId) {
    const targets = await listTargets()
    await log("No chrome-extension target found. Current targets:")
    for (const t of targets.slice(0, 12)) await log(`  - [${t.type}] ${t.url}`)
    await log("READY — browser is open. If the extension loaded, open its popup")
    await log("MANUALLY via the toolbar Extensions (puzzle) icon → 'PrivacyMyst'.")
    process.exit(0)
  }

  await log(`Extension ID: ${extId}`)
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 400, height: 800 })
  await popup.goto(`chrome-extension://${extId}/popup.html`, {
    waitUntil: "domcontentloaded"
  })
  await popup.bringToFront()
  await log(`POPUP OPENED  chrome-extension://${extId}/popup.html`)
  await log("READY — dashboard is open. Browser stays open; close it when done.")

  // Leave the detached browser running; just drop our CDP connection and exit.
  // (Do NOT call browser.close() — for connectOverCDP it can tear down the window.)
  process.exit(0)
}

main().catch(async (err) => {
  await log(`FATAL: ${err?.stack || err}`)
  process.exit(1)
})
