// Standalone WebGPU diagnostic: opens chrome-extension://ID/webgpu-diag.html in
// Edge with the built extension, captures every console line, and reports which
// GPU adapter WebGPU selected + the exact model load/generation error. Isolates
// the WebGPU path from the full UI flow.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXT = join(ROOT, "build", "chrome-mv3-prod")
const BROWSER_EXE =
  process.env.LLM_VERIFY_BROWSER_EXE ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const QS = process.argv[2] || "dtype=q4f16&power=high-performance&device=webgpu"
const TIMEOUT_MS = Number(process.env.DIAG_TIMEOUT_MS || 180000)
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

// Reuse the persistent verify profile so the extension is already registered
// (a fresh profile shows Edge's first-run UI and delays SW registration).
const profileDir =
  process.env.DIAG_PROFILE || join(ROOT, "build", "llm-verify-profile")
// Never hardcode the id (it goes stale on every fresh unpacked load). It is
// auto-resolved from the live service worker below; DIAG_EXT_ID is an optional
// manual override only.
const EXT_ID_OVERRIDE = process.env.DIAG_EXT_ID || ""
let context
let done = false
const lines = []
try {
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: BROWSER_EXE,
    headless: false,
    viewport: { width: 900, height: 700 },
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      ...EXTRA
    ],
    timeout: 60000
  })

  // Find the extension id via service worker.
  let extId = ""
  for (let i = 0; i < 20 && !extId; i++) {
    const sw =
      context.serviceWorkers().find((s) => s.url().includes("/static/background/")) ||
      context.serviceWorkers()[0]
    if (sw) extId = new URL(sw.url()).host
    else await sleep(1000)
  }
  if (!extId) extId = EXT_ID_OVERRIDE
  if (!extId)
    throw new Error(
      "Could not resolve the extension id from the live service worker. " +
        "Run `npm run demo` first or set DIAG_EXT_ID."
    )
  console.log("EXT ID:", extId, EXT_ID_OVERRIDE && extId === EXT_ID_OVERRIDE ? "(manual override)" : "(auto)")

  const page = await context.newPage()
  page.on("console", (m) => {
    const t = m.text()
    if (t.startsWith("DIAG ")) {
      const line = t.slice(5)
      lines.push(line)
      console.log("|", line)
      if (line.startsWith("RESULT ")) done = true
    }
  })
  page.on("pageerror", (e) => console.log("PAGEERROR:", e?.message || String(e)))
  page.on("crash", () => console.log("PAGE CRASH (renderer/gpu process died)"))
  page.on("close", () => console.log("PAGE CLOSED"))

  const url = `chrome-extension://${extId}/${process.env.DIAG_PAGE || "webgpu-diag.html"}?${QS}`
  console.log("OPEN:", url)
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch((e) =>
    console.log("GOTO ERR:", e?.message || String(e))
  )

  const started = Date.now()
  while (Date.now() - started < TIMEOUT_MS && !done) {
    await sleep(1000)
    if (context.pages().length === 0) {
      console.log("ALL PAGES GONE (context died)")
      break
    }
  }
  console.log(
    "VERDICT:",
    lines.some((l) => l.includes("RESULT OK"))
      ? "WEBGPU OK"
      : lines.some((l) => l.includes("RESULT FAIL"))
        ? "WEBGPU FAIL (caught)"
        : "WEBGPU CRASH / NO RESULT (page or gpu process died)"
  )
} catch (err) {
  console.log("FAIL:", err?.stack || err?.message || String(err))
} finally {
  if (context) await Promise.race([context.close().catch(() => {}), sleep(8000)])
  killProfile(profileDir)
}
