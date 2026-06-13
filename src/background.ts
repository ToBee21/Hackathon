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

    // Notify popup (best-effort — it may not be open)
    const msg: BackgroundOutboundMessage = {
      type: "NOISE_INJECTED",
      payload: { keyword, category, timestamp: Date.now() },
    }
    chrome.runtime.sendMessage(msg).catch(() => {})

    // Human-like delay between requests (800 ms – 2.5 s)
    await sleep(randInt(800, 2500))
  }

  // Persist running total
  const { noiseGeneratedCount = 0 } = await chrome.storage.local.get(
    "noiseGeneratedCount"
  )
  await chrome.storage.local.set({
    noiseGeneratedCount: noiseGeneratedCount + batch.length,
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
          .then((data) => sendResponse(data as DataGhostStatus))
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
    }
  }
)

// ---------------------------------------------------------------------------
// Initialisation on install / browser startup
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ noiseGeneratedCount: 0, isNoiseEnabled: true })
  // Kick off the first injection shortly after install
  injectNoise()
})

// Re-register alarm on service-worker wake-up (MV3 workers can be killed)
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 0.5,
        periodInMinutes: NOISE_INTERVAL_MINUTES,
      })
    }
  })
})
