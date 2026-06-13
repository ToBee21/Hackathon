// scripts/launch-demo.mjs
// Launch the BUILT Cloak & Dagger extension in a real Chrome/Edge window and
// open the popup dashboard, so all features can be seen live. Keeps the browser
// open until you close it. Run: `npm run demo` (after `npm run build`).

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
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
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
  throw new Error("No Chrome or Edge executable found. Set PLAYWRIGHT_CHROME_PATH.")
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

  // Get the extension ID from its MV3 service worker.
  let [sw] = context.serviceWorkers()
  if (!sw) {
    await log("Waiting for background service worker…")
    sw = await context.waitForEvent("serviceworker", { timeout: 20000 })
  }
  const extId = new URL(sw.url()).host
  await log(`Extension ID: ${extId}`)

  // Open a real page so content scripts (Bionic Blur, AI Deep-Dive, Honeypot) run.
  const page = context.pages()[0] ?? (await context.newPage())
  try {
    await page.goto("https://example.com", { timeout: 10000 })
    await log("Opened https://example.com (content scripts active)")
  } catch {
    await page.goto("about:blank").catch(() => {})
    await log("No network for example.com — popup still works (offline-safe)")
  }

  // Open the popup dashboard in its own small window-sized tab.
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 400, height: 780 })
  await popup.goto(`chrome-extension://${extId}/popup.html`)
  await popup.bringToFront()
  await log(`POPUP OPENED  chrome-extension://${extId}/popup.html`)
  await log("READY — browser is open. Close the window to end the demo.")

  // Keep the process (and the browser) alive until the user closes it.
  context.on("close", async () => {
    await log("Browser closed — exiting.")
    process.exit(0)
  })
  await new Promise(() => {})
}

main().catch(async (err) => {
  await log(`ERROR: ${err?.stack || err}`)
  process.exit(1)
})
