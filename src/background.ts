// src/background.ts  -  Module A: DataGhost (Noise Engine)
//
// Required Plasmo/manifest permissions:
//   "alarms", "storage"
// Required host_permissions (in package.json → manifest.host_permissions):
//   "https://en.wikipedia.org/*"
//   "https://html.duckduckgo.com/*"
//   "https://www.google.com/*"

import { initHoneypotTrap } from "./shared/honeypot"
import { initCookieShredder } from "./shared/cookieShredder"
import { initTargetingShield } from "./shared/targetingShield"
import { generateAlias } from "./shared/emailAlias"
import type {
  BackgroundInboundMessage,
  BackgroundOutboundMessage,
  DataGhostStatus,
} from "./types"
import { extractVisibleTextWithDebugger } from "./background/aiDeepDive/debuggerTextExtraction"
import { handleAiDeepDiveRiskResult } from "./background/aiDeepDive/handleRiskResult"
import { registerAiDeepDiveTabCoverage } from "./background/aiDeepDive/tabCoverage"
import { classifyHeuristic } from "./shared/aiDeepDive/score"
import type { AiDeepDiveRiskResult } from "./shared/aiDeepDive/types"
import { isCndMessage } from "./shared/messages"
import { panicButton } from "./shared/storage"
import { sanitizeOffscreenLogEntry } from "./security/privacyGuards"

// Moduł D+: "The Honeypot Trap"  -  przechwytuje i zatruwa żądania trackerów.
// Rejestruje własne reguły DNR oraz listenery wiadomości (idempotentnie).
void initHoneypotTrap()

// Moduł: "Cookie Shredder"  -  rotuje/zatruwa ciasteczka trackingowe.
void initCookieShredder()

// Moduł: "Targeting Shield"  -  strip atrybucji (gclid/fbclid/utm) + per-origin
// blackout trackerów na wrażliwych stronach (eskalacja z AI Deep-Dive).
void initTargetingShield()

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALARM_NAME = "dataghost-noise-cycle"
const NOISE_INTERVAL_MINUTES = 1
const REQUESTS_PER_CYCLE_MIN = 2
const REQUESTS_PER_CYCLE_MAX = 5
const BIONIC_ACCEPT_LANGUAGE_RULE_ID = 41001
const BIONIC_MAIN_SCRIPT_ID = "srcContentsBionicBlurMain"

// Shared dashboard state key  -  the single source of truth that Module C
// (Popup) reads for the Privacy Score and live counters. DataGhost mirrors its
// noise total here so Modules A and C stay in sync.
const STORAGE_KEY_STATE = "cnd:state"

// Diverse, neutral keyword categories  -  wide variety defeats interest profiling
const KEYWORD_POOL: Record<string, string[]> = {
  cooking: [
    "pasta carbonara recipe",
    "vegan dinner ideas",
    "sourdough bread baking",
    "homemade soup recipes",
    "meal prep for the week",
    "easy stir fry vegetables",
  ],
  travel: [
    "best beaches in europe",
    "budget backpacking tips",
    "hiking trails national parks",
    "solo travel safety guide",
    "packing light for trips",
  ],
  technology: [
    "open source projects 2024",
    "linux command line tips",
    "smart home diy automation",
    "raspberry pi projects",
    "programming best practices",
  ],
  fitness: [
    "morning workout routine beginners",
    "yoga poses for flexibility",
    "running plan for 5k",
    "bodyweight exercise guide",
    "stretching after workout",
  ],
  gardening: [
    "indoor houseplant care guide",
    "vegetable garden beginners",
    "composting at home tips",
    "balcony container gardening",
    "herb garden kitchen windowsill",
  ],
  science: [
    "space exploration news",
    "climate change facts overview",
    "biology cell types explained",
    "astronomy beginner telescope",
    "physics everyday life examples",
  ],
  culture: [
    "classic films to watch",
    "music theory basics guitar",
    "modern art movements history",
    "book recommendations fiction",
    "documentary films nature",
  ],
  finance: [
    "personal budgeting tips",
    "saving money grocery shopping",
    "beginner investing guide",
    "frugal living ideas",
    "emergency fund how to start",
  ],
  health: [
    "sleep hygiene improvement tips",
    "stress management techniques",
    "nutrition balanced diet basics",
    "mental wellness daily habits",
    "hydration health benefits",
  ],
  hobbies: [
    "watercolor painting tutorial",
    "landscape photography tips",
    "chess opening strategies",
    "knitting patterns beginners",
    "woodworking projects simple",
  ],
}

// Search/content endpoints  -  each generates real network traffic
const QUERY_BUILDERS: Array<(q: string) => string> = [
  (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
  (q) =>
    `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}&ns0=1`,
  (q) =>
    `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en`,
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sendRuntimeMessage(message: BackgroundOutboundMessage | Record<string, unknown>): void {
  try {
    const response = chrome.runtime.sendMessage(message)
    if (response && typeof response.catch === "function") {
      response.catch(() => undefined)
    }
  } catch {
    // Popup can be closed. Runtime messages are best-effort.
  }
}

function setChromePrivacyValue(
  setting: { set?: (details: { value: unknown }, callback?: () => void) => void } | undefined,
  value: unknown
): void {
  try {
    setting?.set?.({ value }, () => void chrome.runtime.lastError)
  } catch {
    // Enterprise policies or missing permissions can block privacy writes.
  }
}

function applyBrowserPrivacyGuards(): void {
  const privacy = chrome.privacy as
    | (typeof chrome.privacy & {
        network?: typeof chrome.privacy.network & {
          networkPredictionEnabled?: {
            set?: (
              details: { value: unknown },
              callback?: () => void
            ) => void
          }
        }
      })
    | undefined

  setChromePrivacyValue(
    privacy?.network?.webRTCIPHandlingPolicy as
      | {
          set?: (
            details: { value: unknown },
            callback?: () => void
          ) => void
        }
      | undefined,
    "disable_non_proxied_udp"
  )
  setChromePrivacyValue(privacy?.network?.networkPredictionEnabled, false)

  try {
    const acceptLanguageRule = {
      id: BIONIC_ACCEPT_LANGUAGE_RULE_ID,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          {
            header: "Accept-Language",
            operation: "set",
            value: "en-US,en;q=0.9"
          }
        ]
      },
      condition: {
        regexFilter: "^https?://",
        resourceTypes: [
          "main_frame",
          "sub_frame",
          "script",
          "xmlhttprequest",
          "image",
          "stylesheet",
          "font",
          "media",
          "ping",
          "other"
        ]
      }
    } as unknown as chrome.declarativeNetRequest.Rule

    chrome.declarativeNetRequest?.updateDynamicRules?.(
      {
        removeRuleIds: [BIONIC_ACCEPT_LANGUAGE_RULE_ID],
        addRules: [acceptLanguageRule]
      },
      () => void chrome.runtime.lastError
    )
  } catch {
    // DNR is a guard layer, not a hard runtime dependency.
  }
}

/**
 * PANIC  -  głębokie czyszczenie danych śledzących. Wywoływane przez Moduł C
 * (Popup) wiadomością PANIC_BUTTON. Wymaga uprawnień "browsingData" oraz
 * host_permissions <all_urls> (oba są w manifeście). Czyści dane przeglądania
 * dla WSZYSTKICH witryn i zeruje współdzielony stan dashboardu  -  przełączniki
 * ochrony pozostają włączone, by obrona działała dalej po wyczyszczeniu.
 */
async function performPanicWipe(): Promise<{
  success: boolean
  clearedBrowsingData: boolean
  clearedState: boolean
  clearedItems?: Record<string, boolean>
  error?: string
  timestamp: number
}> {
  const result = await panicButton()
  const clearedBrowsingData = Boolean(
    result.clearedItems.cookies ||
      result.clearedItems.cache ||
      result.clearedItems.indexedDB ||
      result.clearedItems.localStorage ||
      result.clearedItems.sessionStorage
  )
  const clearedState = Boolean(result.clearedItems.extensionStorage)

  sendRuntimeMessage({
    type: "STATE_UPDATE",
    state: {
      privacyScore: 0,
      trackersBlockedCount: 0,
      noiseGeneratedCount: 0,
      activeAliasEmail: null,
      aiDeepDiveRisk: null,
      aiDeepDiveDetectionCount: 0,
      maxCamoActive: false,
      cookiesRotatedCount: 0,
      paramsStrippedCount: 0,
      targetingBlockedCount: 0
    }
  })

  return {
    success: result.success || clearedState,
    clearedBrowsingData,
    clearedState,
    clearedItems: result.clearedItems,
    error: result.error,
    timestamp: result.timestamp
  }
}

async function injectBionicMainIntoSender(
  sender: chrome.runtime.MessageSender
): Promise<boolean> {
  const tabId = sender.tab?.id
  if (typeof tabId !== "number") return false

  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts({
      ids: [BIONIC_MAIN_SCRIPT_ID]
    })
    const files = scripts[0]?.js
    if (!files?.length) return false

    await chrome.scripting.executeScript({
      target: {
        tabId,
        frameIds:
          typeof sender.frameId === "number" ? [sender.frameId] : undefined
      },
      files,
      world: "MAIN"
    })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Keyword sourcing
// ---------------------------------------------------------------------------

/**
 * Build the keyword list for one noise cycle.
 * Uses only the local keyword pool. No surprise third-party call just to pick
 * topics  -  actual decoy network traffic happens only when DataGhost is enabled.
 */
async function buildKeywordBatch(count: number): Promise<Array<{ keyword: string; category: string }>> {
  const categories = Object.keys(KEYWORD_POOL)
  const batch: Array<{ keyword: string; category: string }> = []

  // Shuffle categories so every cycle uses different ones
  const shuffled = [...categories].sort(() => Math.random() - 0.5)

  for (let i = 0; i < count; i++) {
    const category = shuffled[i % shuffled.length]
    const keyword = pickRandom(KEYWORD_POOL[category])
    batch.push({ keyword, category })
  }

  return batch
}

// ---------------------------------------------------------------------------
// Noise injection
// ---------------------------------------------------------------------------

async function injectNoise(forcedCount?: number): Promise<void> {
  const stored = await chrome.storage.local.get({ isNoiseEnabled: false })
  if (!stored.isNoiseEnabled) return

  const count =
    typeof forcedCount === "number"
      ? Math.max(1, Math.min(8, Math.floor(forcedCount)))
      : randInt(REQUESTS_PER_CYCLE_MIN, REQUESTS_PER_CYCLE_MAX)
  const batch = await buildKeywordBatch(count)

  for (const { keyword, category } of batch) {
    const urlBuilder = pickRandom(QUERY_BUILDERS)
    const url = urlBuilder(keyword)

    try {
      // no-cors: generate network traffic without reading the response.
      // credentials: omit  -  we never send the user's cookies to these targets.
      // HONESTY NOTE: because no cookies/credentials are attached, this is
      // anonymous COVER/DECOY traffic that adds noise at the network/ISP level.
      // It does NOT write into the user's cookie-based ad profile and is not a
      // guaranteed "profile wipe"  -  see readme.md for the accurate description.
      await fetch(url, {
        method: "GET",
        mode: "no-cors",
        credentials: "omit",
        cache: "no-store",
      })
    } catch {
      // Individual request failures are expected and harmless.
    }

    // NOISE_INJECTED preserves the original Module A contract. The UI log is
    // emitted once per batch below, otherwise the dashboard becomes noise.
    const timestamp = Date.now()
    sendRuntimeMessage({
      type: "NOISE_INJECTED",
      payload: { keyword, category, timestamp },
    } as BackgroundOutboundMessage)

    // Human-like delay between requests (800 ms - 2.5 s)
    await sleep(randInt(800, 2500))
  }

  const categories = Array.from(new Set(batch.map((item) => item.category)))
    .slice(0, 3)
    .join(", ")
  sendRuntimeMessage({
    type: "LOG_EVENT",
    entry: {
      timestamp: Date.now(),
      source: "dataGhost",
      message: `DataGhost: batch ${batch.length} zapytan (${categories})`,
      count: batch.length
    },
  })

  // Persist the running total and mirror it onto the shared dashboard state so
  // Module C's Privacy Score and "Wstrzyknięty szum" counter update live.
  await recordNoiseInjected(batch.length)
}

/**
 * Increments the noise counter and mirrors it into the shared dashboard state
 * ("cnd:state") that Module C (Popup) reads. Broadcasts STATE_UPDATE so an open
 * popup reflects the new total without needing to be reopened.
 */
async function recordNoiseInjected(delta: number): Promise<void> {
  const stored = await chrome.storage.local.get({
    noiseGeneratedCount: 0,
    [STORAGE_KEY_STATE]: {},
  })

  const total = ((stored.noiseGeneratedCount as number) ?? 0) + delta
  const sharedState = {
    ...(stored[STORAGE_KEY_STATE] as Record<string, unknown>),
    noiseGeneratedCount: total,
  }

  await chrome.storage.local.set({
    noiseGeneratedCount: total,
    [STORAGE_KEY_STATE]: sharedState,
  })

  sendRuntimeMessage({
    type: "STATE_UPDATE",
    state: { noiseGeneratedCount: total },
  })
}

// ---------------------------------------------------------------------------
// Alarm  -  keeps DataGhost alive across service-worker restarts
// ---------------------------------------------------------------------------

chrome.alarms.get(ALARM_NAME, (existing) => {
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 0.5,
      periodInMinutes: NOISE_INTERVAL_MINUTES,
    })
  }
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    injectNoise()
  }
})

registerAiDeepDiveTabCoverage({
  tabs: chrome.tabs,
  extractRestrictedPageRisk,
  recordResult: (result) =>
    handleAiDeepDiveRiskResult(result, {
      storage: chrome.storage.local,
      sendRuntimeMessage,
      injectNoise
    })
})

async function extractRestrictedPageRisk(
  tabId: number,
  tabUrl: string | undefined
): Promise<AiDeepDiveRiskResult | null> {
  const input = await extractVisibleTextWithDebugger(tabId, tabUrl)
  if (!input) return null

  const result = classifyHeuristic(input)

  return {
    ...result,
    evidenceTags: Array.from(
      new Set(["debugger_dom_text", ...result.evidenceTags])
    ).slice(0, 8),
    model: { mode: "heuristic", id: "debugger-dom", localOnly: true },
    rawTextRetained: false
  }
}

// ---------------------------------------------------------------------------
// Message API  -  used by Popup (Module C) and future modules
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message: BackgroundInboundMessage,
    _sender,
    sendResponse: (r: unknown) => void
  ) => {
    switch (message.type) {
      case "TRIGGER_NOISE":
        injectNoise()
          .then(() => sendResponse({ success: true }))
          .catch(() => sendResponse({ success: false }))
        return true // async response

      case "GET_STATUS":
        chrome.storage.local
          .get({ noiseGeneratedCount: 0, isNoiseEnabled: false })
          .then((data) => sendResponse(data as unknown as DataGhostStatus))
        return true

      case "SET_NOISE_ENABLED":
        chrome.storage.local
          .set({ isNoiseEnabled: message.payload.enabled })
          .then(() => {
            if (message.payload.enabled) {
              chrome.alarms.create(ALARM_NAME, {
                delayInMinutes: 0.5,
                periodInMinutes: NOISE_INTERVAL_MINUTES,
              })
            } else {
              chrome.alarms.clear(ALARM_NAME)
            }
            sendResponse({ success: true })
          })
        return true

      case "TOGGLE_MODULE":
        if (message.module !== "dataGhost") {
          sendResponse({ success: true })
          return false
        }
        chrome.storage.local
          .set({ isNoiseEnabled: message.enabled })
          .then(() => {
            if (message.enabled) {
              chrome.alarms.create(ALARM_NAME, {
                delayInMinutes: 0.5,
                periodInMinutes: NOISE_INTERVAL_MINUTES,
              })
            } else {
              chrome.alarms.clear(ALARM_NAME)
            }
            sendResponse({ success: true })
          })
        return true

      case "REQUEST_STATE":
        chrome.storage.local
          .get({
            noiseGeneratedCount: 0,
            isNoiseEnabled: false,
            "cnd:state": {}
          })
          .then((data) => sendResponse(data))
        return true

      case "INJECT_BIONIC_MAIN":
        injectBionicMainIntoSender(_sender)
          .then((success) => sendResponse({ success }))
          .catch(() => sendResponse({ success: false }))
        return true

      case "PANIC_BUTTON":
        performPanicWipe()
          .then((result) => sendResponse(result))
          .catch(() => sendResponse({ success: false }))
        return true // async response

      case "BIONIC_BLUR_TELEMETRY":
        sendResponse({ success: true })
        return false

      case "AI_DEEP_DIVE_RESULT":
        handleAiDeepDiveRiskResult(message, {
          storage: chrome.storage.local,
          sendRuntimeMessage,
          injectNoise
        })
          .then((result) => sendResponse(result))
          .catch(() => sendResponse({ success: false, maxCamo: false }))
        return true

      case "GENERATE_ALIAS":
        generateAlias()
          .then((alias) => sendResponse({ success: true, alias }))
          .catch((err) =>
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            })
          )
        return true
    }
  }
)

// ---------------------------------------------------------------------------
// Initialisation on install / browser startup
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Contextual floating layer: side panel + context menu wiring
// ---------------------------------------------------------------------------

const STORAGE_KEY_LAST_ANALYSIS = "cnd:last-analysis"
const STORAGE_KEY_OFFSCREEN_LOGS = "cnd:offscreen-logs"
const MAX_OFFSCREEN_LOGS = 200
const activeDeepScanTabs = new Map<string, number>()
const MINUTE_MS = 60 * 1000

function setupContextualSurfaces(): void {
  try {
    // We keep the popup as the action target; the side panel opens via context
    // menu (a real user gesture) and via explicit messages from popup/floating.
    chrome.sidePanel
      ?.setOptions?.({ path: "sidepanel.html", enabled: true })
      ?.catch?.(() => undefined)
  } catch {
    // sidePanel API unavailable (older/other browser)  -  degrade gracefully.
  }
  try {
    chrome.contextMenus?.removeAll?.(() => {
      chrome.contextMenus?.create?.({
        id: "cnd-open-side-panel",
        title: "Cloak & Dagger: otwórz Side Panel",
        contexts: ["all"]
      })
    })
  } catch {
    // contextMenus unavailable  -  non-fatal.
  }
}

chrome.contextMenus?.onClicked?.addListener((info, tab) => {
  if (info.menuItemId !== "cnd-open-side-panel") return
  openSidePanel(tab?.id, tab?.windowId)
})

function openSidePanel(tabId?: number, windowId?: number): void {
  // chrome.sidePanel.open() must run in response to a user gesture. The context
  // menu click and popup button click both qualify; the in-page bubble may not
  // in all browsers  -  that limitation is documented, not faked.
  try {
    const opener = chrome.sidePanel?.open as
      | ((opts: { tabId?: number; windowId?: number }) => Promise<void>)
      | undefined
    if (!opener) return
    if (typeof tabId === "number") {
      opener({ tabId }).catch(() => {
        if (typeof windowId === "number") opener({ windowId }).catch(() => undefined)
      })
    } else if (typeof windowId === "number") {
      opener({ windowId }).catch(() => undefined)
    }
  } catch {
    // Open failed (no gesture / unsupported)  -  caller surface stays usable.
  }
}

// Ensure the single offscreen inference document exists. Heavy model work runs
// in a raw static extension page, outside Parcel's dynamic import shim. Parcel
// cannot load onnxruntime-web's runtime WASM module URLs reliably.
let offscreenSetup: Promise<boolean> | null = null
const OFFSCREEN_DOCUMENT_PATH = "assets/offscreen/offscreen.html"
const OFFSCREEN_INFERENCE_TIMEOUTS_MS: Record<string, number> = {
  "nli-deberta-small": 4 * MINUTE_MS,
  "granite-350m": 15 * MINUTE_MS,
  "gemma-4-e2b": 45 * MINUTE_MS
}

async function ensureOffscreen(): Promise<boolean> {
  const offscreen = chrome.offscreen as
    | {
        hasDocument?: () => Promise<boolean>
        closeDocument?: () => Promise<void>
        createDocument?: (opts: {
          url: string
          reasons: string[]
          justification: string
        }) => Promise<void>
      }
    | undefined
  if (!offscreen?.createDocument) return false
  try {
    if (await hasCurrentOffscreenDocument(offscreen)) return true
    if (!offscreenSetup) {
      offscreenSetup = offscreen
        .createDocument({
          url: OFFSCREEN_DOCUMENT_PATH,
          reasons: ["WORKERS"],
          justification:
            "Local AI risk classification (Transformers.js) off the page and service worker."
        })
        .then(() => true)
        .catch(() => false)
        .finally(() => {
          offscreenSetup = null
        })
    }
    return await offscreenSetup
  } catch {
    return false
  }
}

async function hasCurrentOffscreenDocument(offscreen: {
  hasDocument?: () => Promise<boolean>
  closeDocument?: () => Promise<void>
}): Promise<boolean> {
  if (!(await offscreen.hasDocument?.())) return false

  const runtimeWithContexts = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (query: {
      contextTypes?: string[]
    }) => Promise<Array<{ contextType?: string; documentUrl?: string }>>
  }
  const expectedUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)

  try {
    const contexts = await runtimeWithContexts.getContexts?.({
      contextTypes: ["OFFSCREEN_DOCUMENT"]
    })
    const documentUrl = contexts?.find(
      (context) => context.contextType === "OFFSCREEN_DOCUMENT"
    )?.documentUrl
    if (!documentUrl || documentUrl === expectedUrl) return true

    await offscreen.closeDocument?.()
    return false
  } catch {
    // Older Chrome builds may not expose getContexts. In that case, the bool is
    // the best signal available and avoids repeatedly recreating the document.
    return true
  }
}

// Send the inference request to the offscreen document, retrying while its
// message listener is still registering. createDocument() resolves before the
// offscreen page's bundle finishes loading, so the first send can hit "no
// receiver" ("message port closed before a response")  -  that's a readiness race,
// not a real failure. Once a real inference starts, the await simply waits for it.
async function inferInOffscreen(
  input: unknown,
  config: unknown,
  requestId: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const attempts = 8
  const inferenceTimeoutMs = getOffscreenInferenceTimeoutMs(config)
  let lastErr = "offscreen did not respond"
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await sendOffscreenInferWithTimeout(
        input,
        config,
        requestId,
        inferenceTimeoutMs
      )
      if (res) return res
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
      // Offscreen listener not ready yet  -  wait and retry.
    }
    await new Promise((r) => setTimeout(r, 700))
  }
  return { ok: false, error: lastErr }
}

function sendOffscreenInferWithTimeout(
  input: unknown,
  config: unknown,
  requestId: string,
  timeoutMs: number
): Promise<{ ok: boolean; result?: unknown; error?: string } | undefined> {
  return Promise.race([
    chrome.runtime.sendMessage({
      type: "CND_OFFSCREEN_INFER",
      requestId,
      input,
      config
    }) as Promise<{ ok: boolean; result?: unknown; error?: string } | undefined>,
    new Promise<{ ok: false; error: string }>((resolve) => {
      setTimeout(
        () =>
          resolve({
            ok: false,
            error: `model inference timed out after ${Math.round(timeoutMs / 1000)}s`
          }),
        timeoutMs
      )
    })
  ])
}

function getOffscreenInferenceTimeoutMs(config: unknown): number {
  const selectedModelId =
    typeof config === "object" && config !== null
      ? (config as { selectedModelId?: unknown }).selectedModelId
      : undefined
  if (
    typeof selectedModelId === "string" &&
    selectedModelId in OFFSCREEN_INFERENCE_TIMEOUTS_MS
  ) {
    return OFFSCREEN_INFERENCE_TIMEOUTS_MS[selectedModelId]
  }
  return OFFSCREEN_INFERENCE_TIMEOUTS_MS["nli-deberta-small"]
}

async function recordOffscreenLog(entry: unknown): Promise<void> {
  const normalized = normalizeOffscreenLog(entry)
  const stored = await chrome.storage.local.get({ [STORAGE_KEY_OFFSCREEN_LOGS]: [] })
  const logs = Array.isArray(stored[STORAGE_KEY_OFFSCREEN_LOGS])
    ? (stored[STORAGE_KEY_OFFSCREEN_LOGS] as unknown[])
    : []
  logs.push(normalized)
  await chrome.storage.local.set({
    [STORAGE_KEY_OFFSCREEN_LOGS]: logs.slice(-MAX_OFFSCREEN_LOGS)
  })
  broadcastDeepScanStatus(normalized)
}

function normalizeOffscreenLog(entry: unknown): Record<string, unknown> {
  return sanitizeOffscreenLogEntry(entry) as unknown as Record<string, unknown>
}

function broadcastDeepScanStatus(entry: Record<string, unknown>): void {
  const requestId =
    typeof entry.requestId === "string" ? entry.requestId : undefined
  if (!requestId) return
  const tabId = activeDeepScanTabs.get(requestId)
  if (typeof tabId !== "number") return
  try {
    const sent = chrome.tabs.sendMessage(tabId, {
      type: "CND_DEEP_SCAN_STATUS",
      status: entry
    })
    sent?.catch?.(() => undefined)
  } catch {
    // Content script may be gone; status is still stored for diagnostics.
  }
}

// Dedicated listener for the CND_* contextual-layer protocol. Kept separate from
// the typed switch above so it doesn't widen that message union.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isCndMessage(message)) return
  const { type } = message

  if (type === "CND_OPEN_SIDE_PANEL") {
    if (!isTrustedContentSender(sender)) {
      sendResponse({ ok: false, error: "untrusted sender" })
      return
    }
    openSidePanel(sender.tab?.id, sender.tab?.windowId)
    sendResponse({ ok: true })
    return
  }

  if (type === "CND_DEEP_SCAN") {
    if (!isTrustedContentSender(sender)) {
      sendResponse({ ok: false, error: "untrusted sender" })
      return
    }
    void (async () => {
      const requestId = message.requestId ?? crypto.randomUUID()
      if (typeof sender.tab?.id === "number") {
        activeDeepScanTabs.set(requestId, sender.tab.id)
      }
      const ready = await ensureOffscreen()
      if (!ready) {
        const error = "offscreen document unavailable"
        await recordOffscreenLog({
          requestId,
          level: "error",
          stage: "failed",
          error,
          elapsedMs: 0
        })
        sendResponse({ ok: false, error: "offscreen document unavailable" })
        activeDeepScanTabs.delete(requestId)
        return
      }
      const response = await inferInOffscreen(
        message.input,
        message.config,
        requestId
      )
      if (!response.ok) {
        await recordOffscreenLog({
          requestId,
          level: "error",
          stage: "failed",
          error: response.error ?? "unknown model failure",
          elapsedMs: 0
        })
      }
      sendResponse({ ...response, requestId })
      activeDeepScanTabs.delete(requestId)
    })()
    return true // async response
  }

  if (type === "CND_OFFSCREEN_LOG") {
    if (!isTrustedOffscreenSender(sender)) {
      sendResponse({ ok: false, error: "untrusted sender" })
      return
    }
    void recordOffscreenLog(message.entry).then(() =>
      sendResponse({ ok: true })
    )
    return true // async response
  }

  if (type === "CND_ANALYSIS_UPDATED") {
    if (!isTrustedContentSender(sender)) {
      sendResponse({ ok: false, error: "untrusted sender" })
      return
    }
    const tabId = sender.tab?.id
    if (typeof tabId !== "number") {
      sendResponse({ ok: false })
      return
    }
    chrome.storage.local.get({ [STORAGE_KEY_LAST_ANALYSIS]: {} }).then((res) => {
      const all = (res[STORAGE_KEY_LAST_ANALYSIS] ?? {}) as Record<string, unknown>
      all[String(tabId)] = message.analysis
      chrome.storage.local.set({ [STORAGE_KEY_LAST_ANALYSIS]: all })
      sendResponse({ ok: true })
    })
    return true // async response
  }
})

function isTrustedContentSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && typeof sender.tab?.id === "number"
}

function isTrustedOffscreenSender(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    typeof sender.url === "string" &&
    sender.url.startsWith(chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH))
  )
}

chrome.runtime.onInstalled.addListener(async () => {
  setupContextualSurfaces()
  // Seed both the internal counter and the shared dashboard state so Module C
  // reads a consistent value from the first open.
  const stored = await chrome.storage.local.get({ [STORAGE_KEY_STATE]: {} })
  await chrome.storage.local.set({
    noiseGeneratedCount: 0,
    isNoiseEnabled: false,
    isCookieShredderEnabled: true,
    isTargetingShieldEnabled: true,
    [STORAGE_KEY_STATE]: {
      ...(stored[STORAGE_KEY_STATE] as Record<string, unknown>),
      noiseGeneratedCount: 0,
      cookiesRotatedCount: 0,
      paramsStrippedCount: 0,
      targetingBlockedCount: 0,
    },
  })
  applyBrowserPrivacyGuards()
  // No bundled API token, no install-time external traffic. DataGhost and
  // SimpleLogin become network-active only after explicit user action.
})

// Re-register alarm on service-worker wake-up (MV3 workers can be killed)
chrome.runtime.onStartup.addListener(() => {
  applyBrowserPrivacyGuards()
  setupContextualSurfaces()
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 0.5,
        periodInMinutes: NOISE_INTERVAL_MINUTES,
      })
    }
  })
})
