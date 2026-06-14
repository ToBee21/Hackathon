// src/shared/blocklist/index.ts
// Barrel + remote-update orchestration for the blocklist data layer.
//
// Update flow (v1, server): fetch signed bundle -> vet (signature, anti-rollback,
// anomaly) -> activate, else keep last-known-good. Disabled until both an
// endpoint and a public key are configured, so v0 ships safely with only the
// baked-in baseline.

import { BASELINE_BUNDLE } from "./baselineBundle"
import {
  activateBundle,
  escalateBlocklistForOrigin,
  initBlocklist
} from "./riskAdaptiveBlocking"
import {
  hasUpdateKey,
  vetSignedUpdate,
  type UpdateDecision
} from "./secureUpdater"
import { sanitizeBundle } from "./bundleSchema"
import type { BlocklistBundle, SignedBlocklistBundle } from "./types"

export { initBlocklist, escalateBlocklistForOrigin, activateBundle }
export type { BlocklistBundle, SignedBlocklistBundle }

// Self-hosted command-centre endpoint (Hetzner, served by the portfolio Caddy
// under /blocklist/*). A 404 here (before deploy) just keeps last-known-good.
export const BLOCKLIST_UPDATE_URL =
  "https://hubertjaniak.pl/blocklist/bundle.signed.json"

// Dev/presmoke override (e.g. http://127.0.0.1:8899/bundle.signed.json). SAFE:
// the signature still gates everything, so a hijacked URL cannot inject a bundle
// (bad-signature => reject) nor roll back (anti-rollback => reject); worst case
// is denial-of-update, which falls back to last-known-good. The scheme is
// restricted to https OR loopback http so the override can't silently downgrade
// production traffic to a plaintext attacker.
const STORAGE_KEY_UPDATE_URL = "cnd:blocklist:update-url"
const STORAGE_KEY_BUNDLE = "cnd:blocklist:bundle"
const STORAGE_KEY_HIGH_WATER = "cnd:blocklist:lastAcceptedVersion"
const UPDATE_ALARM = "cnd:blocklist-update"

// Hard ceiling on a fetched body BEFORE JSON parsing. A multi-GB body is the one
// attack the signature does NOT stop (parse happens before verify), so we cap it
// at the network layer. A legit bundle (<=25k domain entries) is well under this.
const MAX_UPDATE_BYTES = 8 * 1024 * 1024

function isAllowedUpdateUrl(url: string): boolean {
  if (/^https:\/\//i.test(url)) return true
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url)
}

async function resolveUpdateUrl(): Promise<string> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY_UPDATE_URL)
    const override = stored?.[STORAGE_KEY_UPDATE_URL]
    if (typeof override === "string" && isAllowedUpdateUrl(override)) {
      return override
    }
  } catch {
    /* no override */
  }
  return BLOCKLIST_UPDATE_URL
}

/**
 * Fetch a body with a hard byte ceiling, enforced while streaming (Content-Length
 * is attacker-controlled, so we also count actual bytes). Returns null if the
 * cap is exceeded or the stream fails.
 */
async function fetchBounded(url: string, maxBytes: number): Promise<string | null> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return null
  const declared = Number(res.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > maxBytes) return null

  const reader = res.body?.getReader()
  if (!reader) {
    // No stream available: fall back to text() but only if the declared size is
    // sane (we already rejected oversized declared lengths above).
    const text = await res.text()
    return text.length > maxBytes ? null : text
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  }
  return new TextDecoder().decode(concatBytes(chunks, total))
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

async function readHighWater(): Promise<number> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY_HIGH_WATER)
    const v = stored?.[STORAGE_KEY_HIGH_WATER]
    return typeof v === "number" && Number.isFinite(v) ? v : 0
  } catch {
    return 0
  }
}

async function readCurrentBundle(): Promise<{
  bundle: BlocklistBundle
  isSeed: boolean
}> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY_BUNDLE)
    const raw = stored?.[STORAGE_KEY_BUNDLE]
    if (raw) {
      const { bundle } = sanitizeBundle(raw)
      if (bundle.entries.length > 0) return { bundle, isSeed: false }
    }
  } catch {
    /* fall through to baked baseline */
  }
  // The baked baseline is the FULL compiled list (~25k entries), not a thin
  // bootstrap seed. So the ratio anomaly gate is meaningful against it and is the
  // correct check — do NOT take the seed bypass, which would (a) be a no-op given
  // a substantial current size and (b) cap a legit first refresh below the real
  // list size and deadlock the remote channel. The absolute seed cap still fires
  // for the genuinely-empty case (current.entries.length === 0) inside
  // evaluateUpdate; over-block remains bounded by MAX_BUNDLE_ENTRIES regardless.
  return { bundle: BASELINE_BUNDLE, isSeed: false }
}

/**
 * Fetch + vet + apply a remote update. Returns the decision for logging. Any
 * failure (network, signature, rollback, anomaly) leaves last-known-good intact.
 */
export async function runBlocklistUpdate(): Promise<UpdateDecision> {
  if (!hasUpdateKey()) return { accept: false, reason: "no-public-key" }
  const url = await resolveUpdateUrl()
  if (!url) return { accept: false, reason: "no-public-key" }

  let signed: SignedBlocklistBundle
  try {
    const body = await fetchBounded(url, MAX_UPDATE_BYTES)
    if (body === null) return { accept: false, reason: "invalid-structure" }
    signed = JSON.parse(body) as SignedBlocklistBundle
  } catch {
    return { accept: false, reason: "invalid-structure" }
  }

  const { bundle: current, isSeed } = await readCurrentBundle()
  const floorVersion = await readHighWater()
  const decision = await vetSignedUpdate(current, signed, {
    currentIsSeed: isSeed,
    floorVersion
  })
  if (decision.accept && decision.bundle) {
    await activateBundle(decision.bundle)
    // Advance the persistent high-water mark so a later storage reset of the
    // active bundle cannot be used to replay this (now-old) version.
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY_HIGH_WATER]: decision.bundle.version
      })
    } catch {
      /* best-effort; floor still defends within the session */
    }
  }
  return decision
}

/**
 * Register the periodic update check (chrome.alarms). Idempotent. Runs once
 * shortly after startup, then on a jittered ~6h cadence. Privacy: each fetch
 * reveals only the client IP + cadence to our own server, which does not log
 * IPs; the whole channel is opt-out via the blocklist module toggle.
 */
export function initBlocklistUpdates(): void {
  const ext = globalThis.chrome
  if (!ext?.alarms || !hasUpdateKey()) return
  try {
    // Jitter the period so clients don't stampede the server on the hour.
    const periodInMinutes = 360 + Math.floor(Math.random() * 60)
    ext.alarms.create(UPDATE_ALARM, { delayInMinutes: 2, periodInMinutes })
    ext.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === UPDATE_ALARM) void runBlocklistUpdate()
    })
  } catch {
    /* alarms unavailable; baseline still protects the user */
  }
}
