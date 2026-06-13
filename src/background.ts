// src/background.ts — Module A: DataGhost (Noise Engine)
//
// Required Plasmo/manifest permissions:
//   "alarms", "storage"
// Required host_permissions (in package.json → manifest.host_permissions):
//   "https://en.wikipedia.org/*"
//   "https://html.duckduckgo.com/*"
//   "https://www.google.com/*"

import type {
  BackgroundInboundMessage,
  BackgroundOutboundMessage,
  DataGhostStatus,
} from "./types"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ALARM_NAME = "dataghost-noise-cycle"
const NOISE_INTERVAL_MINUTES = 1
const REQUESTS_PER_CYCLE_MIN = 2
const REQUESTS_PER_CYCLE_MAX = 5
const BIONIC_ACCEPT_LANGUAGE_RULE_ID = 41001
const BIONIC_MAIN_SCRIPT_ID = "srcContentsBionicBlurMain"

// Shared dashboard state key — the single source of truth that Module C
// (Popup) reads for the Privacy Score and live counters. DataGhost mirrors its
// noise total here so Modules A and C stay in sync.
const STORAGE_KEY_STATE = "cnd:state"

// Diverse, neutral keyword categories — wide variety defeats interest profiling
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

// Search/content endpoints — each generates real network traffic
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

/** Try to fetch a random Wikipedia article title for extra topical diversity. */
async function fetchWikipediaRandomTitle(): Promise<string | null> {
  try {
    const res = await fetch(
      "https://en.wikipedia.org/api/rest_v1/page/random/title",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const title: string | undefined = data?.title
    return title ? title.replace(/_/g, " ").toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * Build the keyword list for one noise cycle.
 * Mixes local pool entries with a live Wikipedia topic when available.
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

  // Replace the last slot with a live Wikipedia title when possible
  const wikiTitle = await fetchWikipediaRandomTitle()
  if (wikiTitle) {
    batch[batch.length - 1] = { keyword: wikiTitle, category: "wikipedia" }
  }

  return batch
}

// ---------------------------------------------------------------------------
// Noise injection
// ---------------------------------------------------------------------------

async function injectNoise(): Promise<void> {
  const stored = await chrome.storage.local.get({ isNoiseEnabled: true })
  if (!stored.isNoiseEnabled) return

  const count = randInt(REQUESTS_PER_CYCLE_MIN, REQUESTS_PER_CYCLE_MAX)
  const batch = await buildKeywordBatch(count)

  for (const { keyword, category } of batch) {
    const urlBuilder = pickRandom(QUERY_BUILDERS)
    const url = urlBuilder(keyword)

    try {
      // no-cors: generate network traffic without reading the response.
      // credentials: omit — we never want to send cookies to these targets.
      await fetch(url, {
        method: "GET",
        mode: "no-cors",
        credentials: "omit",
        cache: "no-store",
      })
    } catch {
      // Individual request failures are expected and harmless.
    }

    // Notify popup (Module C) — best-effort, it may not be open.
    // NOISE_INJECTED preserves the original Module A contract; LOG_EVENT feeds
    // the dashboard's shared real-time logger so each injection shows up live.
    const timestamp = Date.now()
    sendRuntimeMessage({
      type: "NOISE_INJECTED",
      payload: { keyword, category, timestamp },
    } as BackgroundOutboundMessage)
    sendRuntimeMessage({
      type: "LOG_EVENT",
      entry: {
        timestamp,
        source: "dataGhost",
        message: `Wstrzyknięto fałszywy ruch: ${keyword} (${category})`,
      },
    })

    // Human-like delay between requests (800 ms – 2.5 s)
    await sleep(randInt(800, 2500))
  }

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
// Alarm — keeps DataGhost alive across service-worker restarts
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

// ---------------------------------------------------------------------------
// Message API — used by Popup (Module C) and future modules
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
          .get({ noiseGeneratedCount: 0, isNoiseEnabled: true })
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
            isNoiseEnabled: true,
            "cnd:state": {}
          })
          .then((data) => sendResponse(data))
        return true

      case "INJECT_BIONIC_MAIN":
        injectBionicMainIntoSender(_sender)
          .then((success) => sendResponse({ success }))
          .catch(() => sendResponse({ success: false }))
        return true

      case "BIONIC_BLUR_TELEMETRY":
        sendResponse({ success: true })
        return false
    }
  }
)

// ---------------------------------------------------------------------------
// Initialisation on install / browser startup
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  // Seed both the internal counter and the shared dashboard state so Module C
  // reads a consistent value from the first open.
  const stored = await chrome.storage.local.get({ [STORAGE_KEY_STATE]: {} })
  await chrome.storage.local.set({
    noiseGeneratedCount: 0,
    isNoiseEnabled: true,
    [STORAGE_KEY_STATE]: {
      ...(stored[STORAGE_KEY_STATE] as Record<string, unknown>),
      noiseGeneratedCount: 0,
    },
  })
  applyBrowserPrivacyGuards()
  // Kick off the first injection shortly after install
  injectNoise()
})

// Re-register alarm on service-worker wake-up (MV3 workers can be killed)
chrome.runtime.onStartup.addListener(() => {
  applyBrowserPrivacyGuards()
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 0.5,
        periodInMinutes: NOISE_INTERVAL_MINUTES,
      })
    }
  })
})
