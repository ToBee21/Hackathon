// Verify REAL local LLM inference in the built MV3 extension. This is not the
// NLI proof. Success requires selectedModelId=granite-350m/gemma-* and a final
// floating-card source of llm-json.

import { createRequire } from "node:module"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXT = join(ROOT, "build", "chrome-mv3-prod")
const MODEL = process.argv[2] || "granite-350m"
const TIMEOUT_MS = Number(process.env.LLM_VERIFY_TIMEOUT_MS || 960000)
const BROWSER_EXE =
  process.env.LLM_VERIFY_BROWSER_EXE ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const KEEP_PROFILE_ON_FAIL = process.env.LLM_VERIFY_KEEP_PROFILE === "1"
const EXTRA_BROWSER_ARGS = (process.env.LLM_VERIFY_EXTRA_ARGS || "")
  .split(/\s+/)
  .map((arg) => arg.trim())
  .filter(Boolean)
const LOG_KEY = "cnd:offscreen-logs"
const CONFIG_KEY = "cnd:ai-deep-dive:config"
const DEFAULT_PROFILE = join(ROOT, "build", "llm-verify-profile")

const PAGE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="description" content="Coping with depression, eviction, bankruptcy and urgent debt support."/>
<title>Coping With Depression and Debt</title></head>
<body><main><h1>Coping With Depression and Debt</h1>
<p>This article discusses depression symptoms, suicidal thoughts, therapy,
unpaid debt, debt collectors, eviction fear, bankruptcy risk, urgent financial
hardship support, and how sensitive browsing behavior can be profiled.</p>
</main></body></html>`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function formatStatus(entry) {
  const device = entry.device ? ` device=${entry.device}` : ""
  const dtype = entry.selectedDtype || entry.dtype
  const dtypeText = dtype ? ` dtype=${dtype}` : ""
  const fallback = entry.fallbackDtype ? ` fallbackDtype=${entry.fallbackDtype}` : ""
  const model = entry.modelId || entry.selectedModelId || ""
  const progress = typeof entry.progress === "number" ? ` progress=${entry.progress}%` : ""
  const status = entry.status ? ` status=${entry.status}` : ""
  const file = entry.file ? ` file=${entry.file}` : ""
  const error = entry.error
    ? ` error=${typeof entry.error === "string" ? entry.error : entry.error.message || JSON.stringify(entry.error)}`
    : ""
  return `${entry.stage || "unknown"} model=${model}${device}${dtypeText}${fallback}${status}${progress}${file} elapsedMs=${entry.elapsedMs ?? 0}${error}`
}

async function getExtensionId(context) {
  for (let i = 0; i < 35; i++) {
    const sws = context.serviceWorkers()
    const sw = sws.find((s) => s.url().includes("/static/background/")) || sws[0]
    if (sw) return new URL(sw.url()).host
    await sleep(1000)
  }
  return null
}

function killProfileProcesses(profileDir) {
  const escaped = profileDir.replace(/'/g, "''")
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

const server = createServer((_q, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(PAGE_HTML)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const url = `http://127.0.0.1:${server.address().port}/`

let profileDir = process.env.LLM_VERIFY_PROFILE || DEFAULT_PROFILE
const freshProfile = process.env.LLM_VERIFY_FRESH === "1"
if (freshProfile) {
  profileDir = await mkdtemp(join(tmpdir(), "cnd-llm-verify-"))
} else {
  await mkdir(profileDir, { recursive: true })
}
let context
let ok = false
let finalSource = ""
let lastStatus = ""
let lastLlmOutput = ""
let logs = []

try {
  console.log("PROFILE:", profileDir)
  console.log("CACHE MODE:", freshProfile ? "fresh temp profile" : "persistent profile")
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: BROWSER_EXE,
    headless: false,
    viewport: { width: 1100, height: 850 },
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      ...EXTRA_BROWSER_ARGS
    ],
    timeout: 60000
  })

  const extId = await getExtensionId(context)
  console.log("EXT ID:", extId)
  if (!extId) throw new Error("extension service worker not found")

  const extPage = await context.newPage()
  await extPage.goto(`chrome-extension://${extId}/popup.html`, {
    waitUntil: "domcontentloaded"
  })
  await extPage.evaluate(
    ({ configKey, logKey, model }) =>
      new Promise((resolve) => {
        chrome.storage.local.set(
          {
            [logKey]: [],
            [configKey]: {
              aiModeEnabled: true,
              selectedModelId: model,
              nliMinHeuristicScore: 25,
              maxSnippetChars: 2500
            }
          },
          () => resolve()
        )
      }),
    { configKey: CONFIG_KEY, logKey: LOG_KEY, model: MODEL }
  )
  console.log("SELECTED MODEL:", MODEL)

  const page = await context.newPage()
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("#cloak-dagger-floating-root", { timeout: 15000 })
  await page.locator('[data-cloak-dagger="bubble"]').click()
  await page.locator('[data-cloak-dagger="panel"]').waitFor({ timeout: 10000 })
  await page.getByText("Skanuj ponownie").click()
  await page.waitForTimeout(800)

  const sourceBefore = (
    await page.locator('[data-feature="ai-profiling-detector"] .src').textContent()
  )?.trim()
  console.log("SOURCE BEFORE:", sourceBefore)

  await page.getByText("Głęboki skan").click()
  const started = Date.now()
  let printedLogCount = 0
  let lastPrintedProgressKey = ""
  while (Date.now() - started < TIMEOUT_MS) {
    finalSource = (
      (await page
        .locator('[data-feature="ai-profiling-detector"] .src')
        .textContent()
        .catch(() => "")) || ""
    ).trim()
    lastStatus = (
      (await page
        .locator('[data-cloak-dagger="model-status"]')
        .textContent()
        .catch(() => "")) || ""
    ).trim()
    lastLlmOutput = (
      (await page
        .locator('[data-cloak-dagger="llm-json-output"]')
        .textContent()
        .catch(() => "")) || ""
    ).trim()
    logs = await extPage.evaluate((logKey) => {
      return new Promise((resolve) => {
        chrome.storage.local.get(logKey, (res) => resolve(res?.[logKey] || []))
      })
    }, LOG_KEY)
    const nextLogs = logs.slice(printedLogCount)
    for (const entry of nextLogs) {
      const progressKey =
        entry?.stage === "model:progress"
          ? `${entry.modelId}:${entry.status}:${entry.file}:${entry.progress}`
          : ""
      if (entry?.stage !== "model:progress" || progressKey !== lastPrintedProgressKey) {
        console.log("STATUS:", formatStatus(entry))
      }
      if (progressKey) lastPrintedProgressKey = progressKey
    }
    printedLogCount = logs.length

    const failed = logs.find((entry) => entry?.stage === "failed")
    const renderedInsight =
      /Wniosek lokalnego modelu|Ryzyko:/i.test(lastLlmOutput) &&
      !/[{}]/.test(lastLlmOutput)
    if (/(llm-json|lokalny LLM)/i.test(finalSource) && renderedInsight) {
      ok = true
      break
    }
    if (failed || /Błąd LLM|Błąd modelu/i.test(lastStatus)) break
    await sleep(2000)
  }

  const loadingStuck = /Ładowanie modelu|loading/i.test(lastStatus) && !ok
  const dtypeLog = logs.find((entry) => entry?.selectedDtype || entry?.dtype)
  console.log("DEVICE:", dtypeLog?.device || "unknown")
  console.log("DTYPE:", dtypeLog?.selectedDtype || dtypeLog?.dtype || "unknown")
  console.log("STATUS TRACE:")
  for (const entry of logs.slice(-80)) console.log(" -", formatStatus(entry))
  console.log("SOURCE AFTER:", finalSource || "(none)")
  console.log("LAST STATUS:", lastStatus || "(none)")
  console.log(
    "LLM OUTPUT:",
    lastLlmOutput ? lastLlmOutput.slice(0, 1600) : "(none)"
  )
  await page.screenshot({ path: join(ROOT, "build", "llm-insight-view.png") })
  console.log("SCREENSHOT: build/llm-insight-view.png")
  console.log(
    "RESULT:",
    ok
      ? "LIVE LLM INFERENCE OK"
      : loadingStuck
        ? "LLM INFERENCE STUCK IN LOADING"
        : "LIVE LLM INFERENCE NOT CONFIRMED"
  )
} catch (err) {
  console.log("FAIL:", err?.stack || err?.message || String(err))
} finally {
  server.close()
  if (context) {
    await Promise.race([context.close().catch(() => {}), sleep(10000)])
  }
  killProfileProcesses(profileDir)
  if (freshProfile && (ok || !KEEP_PROFILE_ON_FAIL)) {
    await rm(profileDir, { recursive: true, force: true }).catch(() => {})
  }
}

process.exit(ok ? 0 : 1)
