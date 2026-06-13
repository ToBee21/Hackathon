// scripts/launch-demo.mjs
// Launch the BUILT Cloak & Dagger extension in a real Chrome/Edge window and
// open the popup dashboard so every feature can be seen live. The window stays
// open until you close it. Run: `npm run demo` (after `npm run build`).
//
// Robust extension-ID detection: tries Playwright's serviceWorkers() AND a raw
// CDP Target.getTargets() poll (Edge's MV3 service worker doesn't always emit
// the high-level event). If the ID still can't be found, the window is LEFT OPEN
// with on-screen instructions instead of crashing.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { access, appendFile, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXT = join(ROOT, "build", "chrome-mv3-prod")
const LOG = join(ROOT, "build", "demo-launch.log")

const BROWSER_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean)

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findExtensionId(context, page) {
  // Method 1: Playwright's service-worker list.
  const sws = context.serviceWorkers()
  if (sws.length) return new URL(sws[0].url()).host

  // Method 2: raw CDP target enumeration (catches the SW Edge hides).
  try {
    const client = await context.newCDPSession(page)
    const { targetInfos } = await client.send("Target.getTargets")
    const hit = targetInfos.find((t) =>
      String(t.url || "").startsWith("chrome-extension://")
    )
    if (hit) return new URL(hit.url).host
  } catch {}
  return null
}

async function main() {
  await mkdir(join(ROOT, "build"), { recursive: true }).catch(() => {})
  await writeFile(LOG, "").catch(() => {})

  await access(join(EXT, "manifest.json")).catch(() => {
    throw new Error(`No build at ${EXT}. Run 'npm run build' first.`)
  })

  const executablePath = await resolveBrowser()
  await log(`Browser: ${executablePath}`)
  await log(`Extension: ${EXT}`)

  const userDataDir = join(tmpdir(), "cnd-demo-profile")
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--no-first-run",
      "--no-default-browser-check",
      "--start-maximized"
    ]
  })

  // Keep the process (and browser) alive until the user closes it.
  context.on("close", async () => {
    await log("Browser closed — exiting.")
    process.exit(0)
  })

  // Open a real page first — wakes content scripts + the MV3 service worker.
  const page = context.pages()[0] ?? (await context.newPage())
  try {
    await page.goto("https://example.com", { timeout: 12000 })
    await log("Opened https://example.com (content scripts active)")
  } catch {
    await page.goto("about:blank").catch(() => {})
    await log("No network — popup still works (offline-safe)")
  }

  // Poll for the extension ID for up to ~45s using both methods.
  let extId = null
  for (let i = 0; i < 30 && !extId; i++) {
    extId = await findExtensionId(context, page)
    if (!extId) await sleep(1500)
  }

  if (extId) {
    await log(`Extension ID: ${extId}`)
    const popup = await context.newPage()
    await popup.setViewportSize({ width: 400, height: 800 })
    await popup.goto(`chrome-extension://${extId}/popup.html`)
    await popup.bringToFront()
    await log(`POPUP OPENED  chrome-extension://${extId}/popup.html`)
    await log("READY — dashboard is open. Close the window to end the demo.")
  } else {
    await log("READY — extension loaded, but auto-open of the popup failed.")
    await log(
      "OPEN MANUALLY: click the Extensions (puzzle) icon in the toolbar → " +
        "pin 'Cloak & Dagger' → click it. The window stays open."
    )
  }

  await new Promise(() => {})
}

main().catch(async (err) => {
  await log(`FATAL: ${err?.stack || err}`)
  // Even on fatal error, hang so any opened window is not torn down immediately.
  await new Promise(() => {})
})
