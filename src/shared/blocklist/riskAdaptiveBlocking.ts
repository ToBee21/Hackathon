// src/shared/blocklist/riskAdaptiveBlocking.ts
// The runtime engine. Installs the baseline block set everywhere, and — driven
// by the existing AI page-risk engine — escalates to the "escalated" tier ONLY
// on origins flagged high/critical (scorched earth on sensitive pages). Every
// block is provenance-tagged so the UI can say WHY a host was cut.
//
// All rules are pure `block` (a "safe" DNR action, full 30k dynamic budget). The
// engine cannot emit allow/redirect/header rules — the bundle format has no way
// to express them (see bundleSchema.ts). Modeled on targetingShield.ts.

import { sanitizeBundle } from "./bundleSchema"
import { BASELINE_BUNDLE } from "./baselineBundle"
import {
  CATEGORY_LABEL,
  SOURCE_LABEL,
  type BlockProvenance,
  type BlocklistBundle
} from "./types"

const STORAGE_KEY_BUNDLE = "cnd:blocklist:bundle"
const STORAGE_KEY_ENABLED = "cnd:blocklist:enabled"
const STORAGE_KEY_BLOCKED = "cnd:blocklist:blocked-count"

// Rule-id bands, disjoint from honeypot/targetingShield (41001, 43001, 43100+).
const BASELINE_RULE_ID_BASE = 50_000
const BASELINE_MAX_RULES = 200 // chunks of domains; plenty for v0 dynamic budget
const ESCALATION_RULE_ID_BASE = 60_000
const MAX_ESCALATED_ORIGINS = 20
const DOMAINS_PER_RULE = 1_000
const MAX_ESCALATION_RULES_PER_ORIGIN = 25

const BLOCK_RESOURCE_TYPES = [
  "script",
  "xmlhttprequest",
  "image",
  "ping",
  "sub_frame",
  "media",
  "websocket",
  "font",
  "other"
] as unknown as chrome.declarativeNetRequest.ResourceType[]

const DEBUG = true
function log(...args: unknown[]): void {
  if (DEBUG) console.info("[Blocklist]", ...args)
}

let activeBundle: BlocklistBundle = BASELINE_BUNDLE
// domain -> provenance, longest-suffix lookup source for "why blocked".
let provenance = new Map<string, BlockProvenance>()
let escalatedOrigins: string[] = []
let pendingBlocked = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null
let initialized = false

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
    /* best-effort */
  }
}

function rebuildProvenance(bundle: BlocklistBundle): void {
  provenance = new Map()
  for (const entry of bundle.entries) {
    provenance.set(entry.domain, {
      source: entry.source,
      category: entry.category,
      tier: entry.tier
    })
  }
}

/** Longest-suffix provenance lookup for a request host. */
function provenanceForHost(host: string): BlockProvenance | null {
  let candidate = host.toLowerCase().replace(/\.$/, "")
  for (let guard = 0; guard < 10 && candidate.includes("."); guard += 1) {
    const hit = provenance.get(candidate)
    if (hit) return hit
    candidate = candidate.slice(candidate.indexOf(".") + 1)
  }
  return provenance.get(candidate) ?? null
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function buildBlockRules(
  domains: string[],
  idBase: number,
  initiatorHost?: string
): chrome.declarativeNetRequest.Rule[] {
  return chunk(domains, DOMAINS_PER_RULE).map((group, index) => {
    const condition: Record<string, unknown> = {
      requestDomains: group,
      resourceTypes: BLOCK_RESOURCE_TYPES
    }
    if (initiatorHost) condition.initiatorDomains = [initiatorHost]
    return {
      id: idBase + index,
      priority: initiatorHost ? 3 : 1,
      action: { type: "block" },
      condition
    } as unknown as chrome.declarativeNetRequest.Rule
  })
}

function baselineRuleIds(): number[] {
  const ids: number[] = []
  for (let i = 0; i < BASELINE_MAX_RULES; i += 1) ids.push(BASELINE_RULE_ID_BASE + i)
  return ids
}

function escalationRuleIds(): number[] {
  const ids: number[] = []
  for (let i = 0; i < MAX_ESCALATED_ORIGINS; i += 1) {
    for (let j = 0; j < MAX_ESCALATION_RULES_PER_ORIGIN; j += 1) {
      ids.push(ESCALATION_RULE_ID_BASE + i * MAX_ESCALATION_RULES_PER_ORIGIN + j)
    }
  }
  return ids
}

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
    console.error("[Blocklist] updateDynamicRules error:", label, err)
    return false
  }
}

async function loadActiveBundle(): Promise<BlocklistBundle> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY_BUNDLE)
    const raw = stored?.[STORAGE_KEY_BUNDLE]
    if (raw) {
      const { bundle } = sanitizeBundle(raw)
      // Only trust stored bundle if it is at least as new as the shipped seed.
      if (bundle.version >= BASELINE_BUNDLE.version && bundle.entries.length > 0) {
        return bundle
      }
    }
  } catch (err) {
    log("stored bundle invalid, falling back to baseline:", err)
  }
  return BASELINE_BUNDLE
}

async function isEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get({ [STORAGE_KEY_ENABLED]: true })
  return Boolean(stored[STORAGE_KEY_ENABLED])
}

/** Install (or clear) the always-on baseline tier. */
async function applyBaseline(enabled: boolean): Promise<void> {
  if (!dnrReady()) return
  if (!enabled) {
    await updateRules("disable", [...baselineRuleIds(), ...escalationRuleIds()], [])
    escalatedOrigins = []
    return
  }
  const domains = activeBundle.entries
    .filter((e) => e.tier === "baseline")
    .map((e) => e.domain)
  await updateRules(
    "baseline",
    baselineRuleIds(),
    buildBlockRules(domains, BASELINE_RULE_ID_BASE)
  )
}

function hostFromOrigin(origin: string): string | null {
  try {
    const host = new URL(origin).hostname
    return host && host !== "null" ? host : null
  } catch {
    return null
  }
}

/**
 * Scorched earth: on a high/critical origin, block the escalated tier scoped to
 * that origin only. Self-gating; safe no-op without chrome/DNR (tests).
 */
export async function escalateBlocklistForOrigin(
  origin: string,
  level: string
): Promise<void> {
  if (level !== "high" && level !== "critical") return
  if (!dnrReady()) return
  if (!(await isEnabled())) return

  const host = hostFromOrigin(origin)
  if (!host) return
  if (!escalatedOrigins.includes(host)) {
    escalatedOrigins.push(host)
    while (escalatedOrigins.length > MAX_ESCALATED_ORIGINS) escalatedOrigins.shift()
  }

  const escalatedDomains = activeBundle.entries
    .filter((e) => e.tier === "escalated")
    .map((e) => e.domain)
  if (escalatedDomains.length === 0) return

  // Install every chunk per escalated origin. One packed rule is not enough once
  // the escalated tier crosses DOMAINS_PER_RULE.
  const rules: chrome.declarativeNetRequest.Rule[] = []
  escalatedOrigins.forEach((originHost, index) => {
    const built = buildBlockRules(
      escalatedDomains,
      ESCALATION_RULE_ID_BASE + index * MAX_ESCALATION_RULES_PER_ORIGIN,
      originHost
    )
    rules.push(...built.slice(0, MAX_ESCALATION_RULES_PER_ORIGIN))
  })

  await updateRules("escalation", escalationRuleIds(), rules)
  log(`scorched-earth dla originu: ${host} (${escalatedDomains.length} domen)`)
  sendRuntimeMessage({
    type: "LOG_EVENT",
    entry: {
      timestamp: Date.now(),
      source: "blocklist",
      message: `Tryb scorched-earth na wrażliwej stronie ${host}: odcięto ${escalatedDomains.length} agresywnych trackerów`,
      count: 1
    }
  })
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushCounter()
  }, 1500)
}

async function flushCounter(): Promise<void> {
  const delta = pendingBlocked
  pendingBlocked = 0
  if (delta === 0) return
  const stored = await chrome.storage.local.get({ [STORAGE_KEY_BLOCKED]: 0 })
  const total = ((stored[STORAGE_KEY_BLOCKED] as number) ?? 0) + delta
  await chrome.storage.local.set({ [STORAGE_KEY_BLOCKED]: total })
  sendRuntimeMessage({
    type: "STATE_UPDATE",
    state: { blocklistBlockedCount: total }
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
    log("onRuleMatchedDebug niedostępne (filtrowanie działa, liczniki nie rosną)")
    return
  }
  dnr.onRuleMatchedDebug.addListener((info) => {
    const ruleId = info.rule.ruleId
    const isOurs =
      (ruleId >= BASELINE_RULE_ID_BASE &&
        ruleId < BASELINE_RULE_ID_BASE + BASELINE_MAX_RULES) ||
      (ruleId >= ESCALATION_RULE_ID_BASE &&
        ruleId < ESCALATION_RULE_ID_BASE + MAX_ESCALATED_ORIGINS)
    if (!isOurs) return

    pendingBlocked += 1
    scheduleFlush()
    maybeLogProvenance(info.request.url)
  })
}

const provenanceLogAt = new Map<string, number>()
const PROVENANCE_LOG_INTERVAL_MS = 20_000

function maybeLogProvenance(url: string): void {
  let host = ""
  try {
    host = new URL(url).hostname
  } catch {
    return
  }
  const hit = provenanceForHost(host)
  if (!hit) return
  const now = Date.now()
  const last = provenanceLogAt.get(host) ?? 0
  if (now - last < PROVENANCE_LOG_INTERVAL_MS) return
  provenanceLogAt.set(host, now)
  sendRuntimeMessage({
    type: "LOG_EVENT",
    entry: {
      timestamp: now,
      source: "blocklist",
      message: `Odcięto ${host} — ${CATEGORY_LABEL[hit.category]} (lista: ${SOURCE_LABEL[hit.source]})`,
      count: 1
    }
  })
}

function attachMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as { type?: string; module?: string; enabled?: boolean }
    if (msg.type === "TOGGLE_MODULE" && msg.module === "blocklist") {
      const enabled = Boolean(msg.enabled)
      chrome.storage.local
        .set({ [STORAGE_KEY_ENABLED]: enabled })
        .then(() => applyBaseline(enabled))
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }))
      return true
    }
    return undefined
  })
}

/** Public entry — wired from background.ts. Idempotent. */
export async function initBlocklist(): Promise<void> {
  if (initialized) return
  initialized = true
  if (!dnrReady()) {
    log("init pominięty — DNR niedostępne")
    return
  }
  activeBundle = await loadActiveBundle()
  rebuildProvenance(activeBundle)
  attachMatchListener()
  attachMessageListener()
  const enabled = await isEnabled()
  log("init, enabled =", enabled, "· wpisów:", activeBundle.entries.length)
  await applyBaseline(enabled)
}

/** Swap in a freshly-vetted bundle (called by the updater after it passes). */
export async function activateBundle(bundle: BlocklistBundle): Promise<void> {
  activeBundle = bundle
  rebuildProvenance(bundle)
  if (!dnrReady()) return
  await chrome.storage.local.set({ [STORAGE_KEY_BUNDLE]: bundle })
  await applyBaseline(await isEnabled())
}
