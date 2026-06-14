// src/shared/targetingShield.ts
// Moduł: Targeting Shield — realne FILTROWANIE agresywnego targetowania (#4).
//
//  1) ZRYWANIE ATRYBUCJI (zawsze, gdy moduł włączony)
//     Reguła DNR redirect + queryTransform.removeParams zdejmuje z nawigacji
//     parametry łączące tożsamość reklama↔witryna (gclid, fbclid, utm_*, …).
//
//  2) TOTAL BLACKOUT NA WRAŻLIWYCH STRONACH (eskalacja z AI Deep-Dive)
//     Gdy AI oznaczy origin high/critical, reguły `block` (initiatorDomains)
//     odcinają wszystkie hosty targetujące — tylko na tej stronie.
//
// Liczniki przez onRuleMatchedDebug (dev). Samo filtrowanie działa deklaratywnie
// także w produkcji.

const STORAGE_KEY_ENABLED = "isTargetingShieldEnabled"
const STORAGE_KEY_STATE = "cnd:state"
const STORAGE_KEY_PARAMS = "paramsStrippedCount"
const STORAGE_KEY_BLOCKED = "targetingBlockedCount"
const STORAGE_KEY_ORIGINS = "cnd:targeting:blocked-origins"

const PARAM_STRIP_RULE_ID = 43001
const BLOCK_RULE_ID_BASE = 43100
const MAX_BLOCKED_ORIGINS = 30

// Keep diagnostics off by default; matched request URLs can contain attribution
// tokens and search/profile data.
const DEBUG = false
function log(...args: unknown[]): void {
  if (DEBUG) console.info("[TargetingShield]", ...args)
}

function safeUrlLabel(raw: string): string {
  try {
    const url = new URL(raw)
    return `${url.hostname}${url.pathname ? "/..." : ""}`
  } catch {
    return "[invalid-url]"
  }
}

// ---------------------------------------------------------------------------
// Listy
// ---------------------------------------------------------------------------

const TRACKING_PARAMS: string[] = [
  "gclid", "gclsrc", "gbraid", "wbraid", "dclid",
  "fbclid", "msclkid", "yclid", "ttclid", "twclid",
  "igshid", "igsh", "li_fat_id", "epik", "dicbo", "wickedid",
  "mc_eid", "mc_cid", "_hsenc", "_hsmi", "vero_id", "vero_conv",
  "oly_enc_id", "oly_anon_id", "rb_clickid", "s_cid",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "utm_id", "utm_source_platform", "utm_creative_format", "utm_marketing_tactic",
]
const TRACKING_PARAM_SET = new Set(TRACKING_PARAMS)

function urlHasTrackingParam(url: string): boolean {
  try {
    const u = new URL(url)
    for (const key of u.searchParams.keys()) {
      if (TRACKING_PARAM_SET.has(key) || key.startsWith("utm_")) return true
    }
    return false
  } catch {
    return false
  }
}

const TARGETING_HOSTS: string[] = [
  "doubleclick.net", "googlesyndication.com", "googleadservices.com",
  "google-analytics.com", "googletagmanager.com", "adservice.google.com",
  "facebook.com", "facebook.net", "connect.facebook.net",
  "analytics.tiktok.com", "ads.tiktok.com",
  "criteo.com", "criteo.net", "taboola.com", "outbrain.com",
  "adnxs.com", "rubiconproject.com", "pubmatic.com", "openx.net",
  "scorecardresearch.com", "hotjar.com", "clarity.ms", "bat.bing.com",
  "ads.linkedin.com", "amazon-adsystem.com", "adsrvr.org", "bidswitch.net",
]

const BLOCK_RESOURCE_TYPES = [
  "script", "xmlhttprequest", "image", "ping",
  "sub_frame", "media", "websocket", "other",
] as unknown as chrome.declarativeNetRequest.ResourceType[]

// ---------------------------------------------------------------------------
// Środowisko / komunikacja
// ---------------------------------------------------------------------------

function dnrReady(): boolean {
  return (
    typeof chrome !== "undefined" &&
    !!chrome.declarativeNetRequest?.updateDynamicRules &&
    !!chrome.storage?.local
  )
}

function sendRuntimeMessage(message: unknown): void {
  try {
    const res = chrome.runtime.sendMessage(message as object)
    if (res && typeof (res as Promise<unknown>).catch === "function") {
      ;(res as Promise<unknown>).catch(() => undefined)
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Reguły DNR
// ---------------------------------------------------------------------------

/** Strip atrybucji — main_frame/sub_frame, WYŁĄCZNIE http/https (scheme-guard). */
function buildParamStripRule(): chrome.declarativeNetRequest.Rule {
  return {
    id: PARAM_STRIP_RULE_ID,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { transform: { queryTransform: { removeParams: TRACKING_PARAMS } } },
    },
    condition: {
      // KRYTYCZNE: ogranicz do http/https. Bez tego reguła `redirect` dopasowuje
      // się do nawigacji chrome-extension:// / chrome:// / edge:// / about: —
      // a że tych schematów nie wolno przekierować, Chromium ANULUJE nawigację
      // z ERR_BLOCKED_BY_CLIENT (blokowało to nasz własny dashboard/popup).
      regexFilter: "^https?://",
      resourceTypes: [
        "main_frame",
        "sub_frame",
      ] as unknown as chrome.declarativeNetRequest.ResourceType[],
    },
  } as unknown as chrome.declarativeNetRequest.Rule
}

function buildBlockRules(hosts: string[]): chrome.declarativeNetRequest.Rule[] {
  return hosts.slice(0, MAX_BLOCKED_ORIGINS).map((host, index) => ({
    id: BLOCK_RULE_ID_BASE + index,
    priority: 2,
    action: { type: "block" },
    condition: {
      requestDomains: TARGETING_HOSTS,
      initiatorDomains: [host],
      resourceTypes: BLOCK_RESOURCE_TYPES,
    },
  })) as unknown as chrome.declarativeNetRequest.Rule[]
}

function blockRuleIds(): number[] {
  const ids: number[] = []
  for (let i = 0; i < MAX_BLOCKED_ORIGINS; i++) ids.push(BLOCK_RULE_ID_BASE + i)
  return ids
}

/** Pojedyncze, izolowane wywołanie updateDynamicRules z jawnym logiem błędu. */
async function updateRules(
  label: string,
  removeRuleIds: number[],
  addRules: chrome.declarativeNetRequest.Rule[]
): Promise<boolean> {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules })
    log(`${label}: OK (+${addRules.length} reguł)`)
    return true
  } catch (err) {
    console.error("[TargetingShield] BŁĄD updateDynamicRules:", label, err)
    return false
  }
}

async function dumpRules(): Promise<void> {
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules()
    const ours = rules
      .filter(
        (r) =>
          r.id === PARAM_STRIP_RULE_ID ||
          (r.id >= BLOCK_RULE_ID_BASE && r.id < BLOCK_RULE_ID_BASE + MAX_BLOCKED_ORIGINS)
      )
      .map((r) => r.id)
    log("zainstalowane reguły:", ours.length ? ours.join(", ") : "BRAK")
  } catch (err) {
    console.error("[TargetingShield] getDynamicRules:", err)
  }
}

// ---------------------------------------------------------------------------
// Persystencja chronionych originów
// ---------------------------------------------------------------------------

async function readOrigins(): Promise<string[]> {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY_ORIGINS]: [] })
  const value = stored[STORAGE_KEY_ORIGINS]
  return Array.isArray(value) ? (value as string[]) : []
}

async function writeOrigins(hosts: string[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_ORIGINS]: hosts })
}

function hostFromOrigin(origin: string): string | null {
  try {
    const host = new URL(origin).hostname
    return host && host !== "null" ? host : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Instalacja reguł — strip i block ODDZIELNIE (błąd jednej nie zabija drugiej)
// ---------------------------------------------------------------------------

async function applyRules(enabled: boolean): Promise<void> {
  if (!dnrReady()) {
    log("DNR niedostępne — pomijam")
    return
  }

  if (!enabled) {
    await updateRules("wyłączenie", [PARAM_STRIP_RULE_ID, ...blockRuleIds()], [])
    return
  }

  await updateRules("strip-atrybucji", [PARAM_STRIP_RULE_ID], [buildParamStripRule()])
  const hosts = await readOrigins()
  await updateRules("blackout-originów", blockRuleIds(), buildBlockRules(hosts))
  await dumpRules()
}

/**
 * Eskalacja: dla wrażliwego originu (high/critical) odetnij wszystkie hosty
 * targetujące. Self-gating; bezpieczne w testach (no-op bez chrome/DNR).
 */
export async function escalateTargetingForOrigin(
  origin: string,
  level: string
): Promise<void> {
  if (level !== "high" && level !== "critical") return
  await blockOriginNow(origin, "ai")
}

/** Wspólny rdzeń eskalacji (używany też przez ręczny test). */
async function blockOriginNow(origin: string, reason: "ai" | "test"): Promise<string | null> {
  if (!dnrReady()) return null

  const { [STORAGE_KEY_ENABLED]: enabled } = await chrome.storage.local.get({
    [STORAGE_KEY_ENABLED]: true,
  })
  if (!enabled) {
    log("blackout pominięty — moduł wyłączony")
    return null
  }

  const host = hostFromOrigin(origin)
  if (!host) {
    log("blackout pominięty — brak hosta dla", origin)
    return null
  }

  const hosts = await readOrigins()
  if (!hosts.includes(host)) {
    hosts.push(host)
    while (hosts.length > MAX_BLOCKED_ORIGINS) hosts.shift()
    await writeOrigins(hosts)
  }

  const ok = await updateRules("blackout-originów", blockRuleIds(), buildBlockRules(hosts))
  await dumpRules()
  if (!ok) return null

  log(`BLACKOUT (${reason}) dla originu: ${host}`)
  sendRuntimeMessage({
    type: "LOG_EVENT",
    entry: {
      timestamp: Date.now(),
      source: "targetingShield",
      message: `Total blackout trackerów na wrażliwej stronie: ${host}`,
      count: 1,
    },
  })
  return host
}

// ---------------------------------------------------------------------------
// Liczniki (batched)
// ---------------------------------------------------------------------------

let pendingParams = 0
let pendingBlocked = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushCounters()
  }, 1500)
}

async function flushCounters(): Promise<void> {
  const dp = pendingParams
  const db = pendingBlocked
  pendingParams = 0
  pendingBlocked = 0
  if (dp === 0 && db === 0) return

  const stored = await chrome.storage.local.get({
    [STORAGE_KEY_PARAMS]: 0,
    [STORAGE_KEY_BLOCKED]: 0,
    [STORAGE_KEY_STATE]: {},
  })
  const paramsTotal = ((stored[STORAGE_KEY_PARAMS] as number) ?? 0) + dp
  const blockedTotal = ((stored[STORAGE_KEY_BLOCKED] as number) ?? 0) + db

  await chrome.storage.local.set({
    [STORAGE_KEY_PARAMS]: paramsTotal,
    [STORAGE_KEY_BLOCKED]: blockedTotal,
    [STORAGE_KEY_STATE]: {
      ...(stored[STORAGE_KEY_STATE] as Record<string, unknown>),
      paramsStrippedCount: paramsTotal,
      targetingBlockedCount: blockedTotal,
    },
  })

  sendRuntimeMessage({
    type: "STATE_UPDATE",
    state: { paramsStrippedCount: paramsTotal, targetingBlockedCount: blockedTotal },
  })

  const parts: string[] = []
  if (dp > 0) parts.push(`zerwano ${dp} atrybucji`)
  if (db > 0) parts.push(`odcięto ${db} beaconów targetujących`)
  sendRuntimeMessage({
    type: "LOG_EVENT",
    entry: {
      timestamp: Date.now(),
      source: "targetingShield",
      message: `Targeting Shield: ${parts.join(", ")}`,
      count: dp + db,
    },
  })
}

function attachMatchListener(): void {
  const dnr = chrome.declarativeNetRequest as typeof chrome.declarativeNetRequest & {
    onRuleMatchedDebug?: {
      addListener: (
        cb: (info: chrome.declarativeNetRequest.MatchedRuleInfoDebug) => void
      ) => void
    }
  }

  if (!dnr.onRuleMatchedDebug) {
    log("onRuleMatchedDebug niedostępne (liczniki nie będą rosły, ale filtrowanie działa)")
    return
  }

  dnr.onRuleMatchedDebug.addListener((info) => {
    const ruleId = info.rule.ruleId
    if (ruleId === PARAM_STRIP_RULE_ID) {
      if (urlHasTrackingParam(info.request.url)) {
        log("strip:", safeUrlLabel(info.request.url))
        pendingParams += 1
        scheduleFlush()
      }
    } else if (
      ruleId >= BLOCK_RULE_ID_BASE &&
      ruleId < BLOCK_RULE_ID_BASE + MAX_BLOCKED_ORIGINS
    ) {
      log("block:", safeUrlLabel(info.request.url))
      pendingBlocked += 1
      scheduleFlush()
    }
  })
}

// ---------------------------------------------------------------------------
// Listener wiadomości — toggle + ręczny test
// ---------------------------------------------------------------------------

function attachMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as { type?: string; module?: string; enabled?: boolean }

    if (msg.type === "TOGGLE_MODULE" && msg.module === "targetingShield") {
      const enabled = Boolean(msg.enabled)
      chrome.storage.local
        .set({ [STORAGE_KEY_ENABLED]: enabled })
        .then(() => applyRules(enabled))
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }))
      return true
    }

    // Ręczny test blackoutu na bieżącej karcie (bez czekania na AI).
    if (msg.type === "TRIGGER_TARGETING_TEST") {
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => blockOriginNow(tab?.url ?? "", "test"))
        .then((host) => sendResponse({ success: Boolean(host), host }))
        .catch(() => sendResponse({ success: false }))
      return true
    }

    return undefined
  })
}

// ---------------------------------------------------------------------------
// Inicjalizacja publiczna — wołana z background.ts (idempotentna)
// ---------------------------------------------------------------------------

let initialized = false

export async function initTargetingShield(): Promise<void> {
  if (initialized) return
  initialized = true
  if (!dnrReady()) {
    log("init pominięty — DNR niedostępne")
    return
  }

  attachMatchListener()
  attachMessageListener()

  const { [STORAGE_KEY_ENABLED]: enabled } = await chrome.storage.local.get({
    [STORAGE_KEY_ENABLED]: true,
  })
  log("init, enabled =", enabled)
  await applyRules(Boolean(enabled))
}
