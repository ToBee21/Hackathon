import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const browser = await chromium.connectOverCDP("http://127.0.0.1:9333")
const context = browser.contexts()[0]

console.log("PAGES:", context.pages().map((p) => p.url()))
console.log("SWs:", context.serviceWorkers().map((s) => s.url()))

const sw = context.serviceWorkers()[0]
if (!sw) {
  console.log("NO SERVICE WORKER")
  process.exit(1)
}

const TARGET_OFFSCREEN = "assets/offscreen/offscreen.html"
const LOG_KEY = "cnd:offscreen-logs"

const diag = await sw.evaluate(async () => {
  const target = "assets/offscreen/offscreen.html"
  const expectedUrl = chrome.runtime.getURL(target)
  const out = {
    hasDocument: null,
    hasDocErr: null,
    contexts: null,
    ctxErr: null,
    closedStale: false,
    createErr: null
  }
  try {
    out.hasDocument = await chrome.offscreen.hasDocument()
  } catch (e) {
    out.hasDocErr = String(e)
  }
  try {
    const ctxs = await chrome.runtime.getContexts({})
    out.contexts = ctxs.map((c) => ({ type: c.contextType, url: c.documentUrl }))
  } catch (e) {
    out.ctxErr = String(e)
  }
  const offscreenContext = out.contexts?.find((c) => c.type === "OFFSCREEN_DOCUMENT")
  if (offscreenContext?.url && offscreenContext.url !== expectedUrl) {
    try {
      await chrome.offscreen.closeDocument()
      out.closedStale = true
      out.hasDocument = false
    } catch (e) {
      out.createErr = String(e)
    }
  }
  // Try to (re)create the offscreen document and capture any error verbatim.
  try {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: target,
        reasons: ["WORKERS"],
        justification: "diag"
      })
    }
  } catch (e) {
    out.createErr = String(e)
  }
  return out
})
console.log("DIAG:", JSON.stringify(diag, null, 2))
console.log("TARGET:", TARGET_OFFSCREEN)

// If an offscreen context exists, ping its listener. The raw module imports the
// vendored runtime first, so give it a short retry window before calling it dead.
const ping = await sw.evaluate(async (logKey) => {
  const requestId = crypto.randomUUID()
  await chrome.storage.local.set({ [logKey]: [] })
  let lastErr = "offscreen did not respond"
  for (let i = 0; i < 8; i += 1) {
    try {
      const res = await chrome.runtime.sendMessage({
        type: "CND_OFFSCREEN_INFER",
        requestId,
        input: {
          title: "Urgent support for depression and unpaid debt",
          meta: "Synthetic privacy fixture",
          headings: "Financial hardship and therapy support",
          body: "Guide for people dealing with depression symptoms, suicidal thoughts, unpaid debt, eviction fear, bankruptcy risk and urgent financial hardship. ".repeat(8),
          origin: "https://x.test",
          path: "/"
        },
        config: { aiModeEnabled: true, selectedModelId: "nli-deberta-small", nliMinHeuristicScore: 25, maxSnippetChars: 2500 }
      })
      const logs = await chrome.storage.local.get(logKey)
      return { ok: true, attempt: i + 1, requestId, res, logs: logs?.[logKey] ?? [] }
    } catch (e) {
      lastErr = String(e)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  const logs = await chrome.storage.local.get(logKey)
  return { ok: false, requestId, err: lastErr, logs: logs?.[logKey] ?? [] }
}, LOG_KEY)
console.log("PING RESULT:", JSON.stringify(ping).slice(0, 600))
console.log("STATUS TRACE:")
for (const entry of ping.logs ?? []) {
  console.log(
    ` - ${entry.stage || "unknown"} model=${entry.modelId || entry.selectedModelId || ""} device=${entry.device || ""} dtype=${entry.selectedDtype || entry.dtype || ""} elapsedMs=${entry.elapsedMs ?? 0} error=${entry.error?.message || entry.error || ""}`
  )
}

process.exit(0)
