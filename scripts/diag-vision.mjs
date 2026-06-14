// Vision ad-detector verifier. Launches Edge with the BUILT extension from this
// isolated copy, opens chrome-extension://ID/assets/vision/vision.html, captures
// every DIAG-prefixed console line, and asserts that the synthetic ad banner is
// classified as an advertisement. Prints a PASS/FAIL table.
//
// Pattern adapted from scripts/diag-webgpu.mjs but uses a UNIQUE profile dir so
// it never collides with the main repo's llm-verify-profile.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { execFileSync } from "node:child_process"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXT = join(ROOT, "build", "chrome-mv3-prod")
const BROWSER_EXE =
  process.env.LLM_VERIFY_BROWSER_EXE ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const DIAG_PAGE = process.env.DIAG_PAGE || "assets/vision/vision.html"
const QS = process.env.DIAG_QS || "synthetic=1"
const TIMEOUT_MS = Number(process.env.DIAG_TIMEOUT_MS || 300000)
// Unique profile dir to avoid collisions with the main repo / other runs.
const profileDir =
  process.env.DIAG_PROFILE || join(ROOT, "build", "vision-verify-profile")
const EXTRA = (process.env.DIAG_EXTRA_ARGS || "")
  .split(/\s+/)
  .map((s) => s.trim())
  .filter(Boolean)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function killProfile(dir) {
  const escaped = dir.replace(/'/g, "''")
  try {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `$p='${escaped}'; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like ('*' + $p + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
      ],
      { stdio: "ignore" }
    )
  } catch {}
}

let context
let done = false
let result = null
const lines = []
try {
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: BROWSER_EXE,
    headless: false,
    viewport: { width: 980, height: 760 },
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan",
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      ...EXTRA
    ],
    timeout: 60000
  })

  // Resolve the extension id from the live service worker.
  let extId = process.env.DIAG_EXT_ID || ""
  for (let i = 0; i < 30 && !extId; i++) {
    const sw =
      context
        .serviceWorkers()
        .find((s) => s.url().includes("/static/background/")) ||
      context.serviceWorkers()[0]
    if (sw) extId = new URL(sw.url()).host
    else await sleep(1000)
  }
  if (!extId) throw new Error("Could not resolve extension id from service worker")
  console.log("EXT ID:", extId)
  console.log("EXT DIR:", EXT)

  const page = await context.newPage()
  page.on("console", (m) => {
    const t = m.text()
    if (t.startsWith("DIAG ")) {
      const line = t.slice(5)
      lines.push(line)
      console.log("|", line)
      if (line.startsWith("RESULT ")) {
        done = true
        try {
          result = JSON.parse(line.slice("RESULT ".length))
        } catch {}
      }
    } else if (/error|fail|exception/i.test(t)) {
      console.log("· console:", t.slice(0, 300))
    }
  })
  page.on("pageerror", (e) => console.log("PAGEERROR:", e?.message || String(e)))
  page.on("crash", () => console.log("PAGE CRASH (renderer/gpu process died)"))
  page.on("close", () => console.log("PAGE CLOSED"))

  const url = `chrome-extension://${extId}/${DIAG_PAGE}?${QS}`
  console.log("OPEN:", url)
  await page
    .goto(url, { waitUntil: "domcontentloaded" })
    .catch((e) => console.log("GOTO ERR:", e?.message || String(e)))

  const started = Date.now()
  while (Date.now() - started < TIMEOUT_MS && !done) {
    await sleep(1000)
    if (context.pages().length === 0) {
      console.log("ALL PAGES GONE (context died)")
      break
    }
  }
} catch (err) {
  console.log("FAIL:", err?.stack || err?.message || String(err))
} finally {
  if (context) await Promise.race([context.close().catch(() => {}), sleep(8000)])
  killProfile(profileDir)
}

// ---- PASS/FAIL table -------------------------------------------------------
const gotResult = !!result
const isAd = !!result?.isAd
const pass = gotResult && isAd

const pad = (s, n) => String(s).padEnd(n)
console.log("\n========== VISION AD-DETECTOR VERIFY ==========")
console.log(pad("check", 34) + "result")
console.log("-".repeat(46))
console.log(pad("model loaded + generated", 34) + (gotResult ? "PASS" : "FAIL"))
console.log(
  pad("synthetic banner -> IS advertisement", 34) + (isAd ? "PASS" : "FAIL")
)
if (result) {
  console.log(pad("load ms", 34) + result.loadMs)
  console.log(pad("generate ms", 34) + result.genMs)
  console.log(pad("answer", 34) + JSON.stringify(result.answer))
}
console.log("-".repeat(46))
console.log("OVERALL: " + (pass ? "PASS" : "FAIL"))
console.log("===============================================")

process.exitCode = pass ? 0 : 1
