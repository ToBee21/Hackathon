import type { PlasmoCSConfig } from "plasmo"

import mainWorldScriptUrl from "url:./contents/bionic-blur-main"

import {
  DEFAULT_BIONIC_BLUR_CONFIG,
  buildPrivacyProfile
} from "./shared/bionicBlurCore"
import type {
  BionicBlurConfig,
  BionicBlurTelemetryMessage,
  FingerprintSurface,
  PrivacyState
} from "./types"

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  run_at: "document_start",
  all_frames: true
}

const CHANNEL = "cloak-dagger:bionic-blur"
const MAIN_TO_BRIDGE = "main-to-bridge"
const BRIDGE_TO_MAIN = "bridge-to-main"
const STORAGE_KEY_TOGGLES = "cnd:toggles"
const STORAGE_KEY_STATE = "cnd:state"
const STORAGE_KEY_CONFIG = "cnd:bionic-blur:config"
const STORAGE_KEY_SEED = "cnd:bionic-blur:profile-seed"
const LOG_EVENT_MIN_INTERVAL_MS = 8000

type RuntimeLogSource = "dataGhost" | "mouseJitter" | "keystroke" | "system"

interface MainTelemetryEntry {
  surface: FingerprintSurface
  action: "patched" | "blurred" | "blocked" | "configured" | "proof"
  count: number
  timestamp: number
  metrics?: Record<string, number | string | boolean>
}

interface MainTelemetryEnvelope {
  source: typeof CHANNEL
  direction: typeof MAIN_TO_BRIDGE
  type: "BIONIC_BLUR_TELEMETRY"
  payload: MainTelemetryEntry[]
}

interface StoredToggles {
  dataGhost?: boolean
  mouseJitter?: boolean
  keystroke?: boolean
}

const ext = globalThis.chrome
let profileSeed = "boot"
let activeConfig: BionicBlurConfig = {
  ...DEFAULT_BIONIC_BLUR_CONFIG,
  debugMode:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
}
const lastUiLogBySurface = new Map<string, { count: number; timestamp: number }>()

void initializeBridge()

async function initializeBridge(): Promise<void> {
  if (!ext?.storage?.local) {
    postConfigToMain(activeConfig, profileSeed)
    return
  }

  profileSeed = await getOrCreateProfileSeed()
  activeConfig = await loadConfig()
  injectMainWorldScriptTag()
  requestMainWorldInjection()
  postConfigToMain(activeConfig, profileSeed)
  setTimeout(() => postConfigToMain(activeConfig, profileSeed), 75)
  setTimeout(() => postConfigToMain(activeConfig, profileSeed), 250)

  ext.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local") return
    if (
      changes[STORAGE_KEY_TOGGLES] ||
      changes[STORAGE_KEY_CONFIG] ||
      changes[STORAGE_KEY_SEED]
    ) {
      void refreshConfig()
    }
  })

  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!isMainTelemetryEnvelope(data)) return
    handleTelemetry(data.payload)
  })
}

async function refreshConfig(): Promise<void> {
  profileSeed = await getOrCreateProfileSeed()
  activeConfig = await loadConfig()
  postConfigToMain(activeConfig, profileSeed)
}

function postConfigToMain(config: BionicBlurConfig, seed: string): void {
  window.postMessage(
    {
      source: CHANNEL,
      direction: BRIDGE_TO_MAIN,
      type: "BIONIC_BLUR_CONFIG",
      payload: {
        config,
        profileSeed: seed
      }
    },
    "*"
  )
}

async function loadConfig(): Promise<BionicBlurConfig> {
  const result = await storageGet([STORAGE_KEY_TOGGLES, STORAGE_KEY_CONFIG])
  const toggles = (result[STORAGE_KEY_TOGGLES] ?? {}) as StoredToggles
  const storedConfig = (result[STORAGE_KEY_CONFIG] ?? {}) as Partial<BionicBlurConfig>
  const proofDebug =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"

  return {
    ...DEFAULT_BIONIC_BLUR_CONFIG,
    ...storedConfig,
    mouseEnabled: toggles.mouseJitter ?? storedConfig.mouseEnabled ?? true,
    keyboardEnabled: toggles.keystroke ?? storedConfig.keyboardEnabled ?? true,
    debugMode: storedConfig.debugMode ?? proofDebug
  }
}

async function getOrCreateProfileSeed(): Promise<string> {
  const stored = await storageGet(STORAGE_KEY_SEED)
  const existing = stored[STORAGE_KEY_SEED]
  if (typeof existing === "string" && existing.length > 0) return existing

  const seed = createRandomSeed()
  await storageSet({ [STORAGE_KEY_SEED]: seed })
  return seed
}

function createRandomSeed(): string {
  const bytes = new Uint32Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(8, "0")).join("")
}

function isMainTelemetryEnvelope(value: unknown): value is MainTelemetryEnvelope {
  const envelope = value as Partial<MainTelemetryEnvelope>
  return (
    envelope?.source === CHANNEL &&
    envelope.direction === MAIN_TO_BRIDGE &&
    envelope.type === "BIONIC_BLUR_TELEMETRY" &&
    Array.isArray(envelope.payload)
  )
}

function handleTelemetry(entries: MainTelemetryEntry[]): void {
  for (const entry of entries) {
    if (!isTelemetryEntry(entry)) continue

    const runtimeMessage: BionicBlurTelemetryMessage = {
      type: "BIONIC_BLUR_TELEMETRY",
      payload: {
        surface: entry.surface,
        action: entry.action,
        count: sanitizeCount(entry.count),
        timestamp: entry.timestamp,
        metrics: sanitizeMetrics(entry.metrics)
      }
    }

    sendRuntimeMessage(runtimeMessage)
    maybeSendTelemetryLog(entry)

    if (entry.action === "blurred" || entry.action === "blocked") {
      void incrementTrackerCounter(sanitizeCount(entry.count))
    }
  }
}

function maybeSendTelemetryLog(entry: MainTelemetryEntry): void {
  if (entry.action !== "blurred" && entry.action !== "blocked") return

  const count = sanitizeCount(entry.count)
  const key = `${entry.surface}:${entry.action}`
  const previous = lastUiLogBySurface.get(key)
  const pendingCount = (previous?.count ?? 0) + count
  const lastTimestamp = previous?.timestamp ?? 0
  const shouldEmit =
    previous === undefined ||
    entry.timestamp - lastTimestamp >= LOG_EVENT_MIN_INTERVAL_MS

  if (!shouldEmit) {
    lastUiLogBySurface.set(key, {
      count: pendingCount,
      timestamp: lastTimestamp
    })
    return
  }

  sendRuntimeMessage({
    type: "LOG_EVENT",
    entry: {
      timestamp: entry.timestamp,
      source: sourceForSurface(entry.surface),
      message: describeTelemetry(entry, pendingCount),
      count: pendingCount
    }
  })
  lastUiLogBySurface.set(key, { count: 0, timestamp: entry.timestamp })
}

function isTelemetryEntry(value: unknown): value is MainTelemetryEntry {
  const entry = value as Partial<MainTelemetryEntry>
  return (
    typeof entry?.surface === "string" &&
    typeof entry.action === "string" &&
    typeof entry.count === "number" &&
    typeof entry.timestamp === "number"
  )
}

function sanitizeCount(count: number): number {
  if (!Number.isFinite(count)) return 1
  return Math.max(1, Math.min(500, Math.floor(count)))
}

function sanitizeMetrics(
  metrics: MainTelemetryEntry["metrics"]
): Record<string, number | string | boolean> | undefined {
  if (!metrics || typeof metrics !== "object") return undefined
  return Object.fromEntries(
    Object.entries(metrics)
      .filter(([, value]) =>
        ["number", "string", "boolean"].includes(typeof value)
      )
      .slice(0, 12)
  )
}

function sourceForSurface(surface: FingerprintSurface): RuntimeLogSource {
  if (surface === "mouse") return "mouseJitter"
  if (surface === "keyboard") return "keystroke"
  return "system"
}

function describeTelemetry(entry: MainTelemetryEntry, count: number): string {
  switch (entry.surface) {
    case "mouse":
      return `Mysz: zamaskowano ${count} sygnalow ruchu`
    case "keyboard":
      return `Klawiatura: zamaskowano timing ${count} zdarzen`
    case "canvas":
    case "webgl":
    case "audio":
    case "fonts":
      return `Fingerprint: ${entry.surface} oszukany ${count} razy`
    case "permissions":
    case "media-devices":
    case "battery":
      return `API ograniczone: ${entry.surface} x${count}`
    default:
      return `Bionic Blur: ${entry.surface} ${entry.action} x${count}`
  }
}

async function incrementTrackerCounter(delta: number): Promise<void> {
  if (!ext?.storage?.local) return
  const result = await storageGet(STORAGE_KEY_STATE)
  const previous = (result[STORAGE_KEY_STATE] ?? {}) as Partial<PrivacyState>
  const nextState: Partial<PrivacyState> = {
    ...previous,
    trackersBlockedCount: (previous.trackersBlockedCount ?? 0) + delta
  }
  await storageSet({ [STORAGE_KEY_STATE]: nextState })
  sendRuntimeMessage({ type: "STATE_UPDATE", state: nextState })
}

function sendRuntimeMessage(message: unknown): void {
  try {
    const response = ext?.runtime?.sendMessage?.(message)
    if (response && typeof response.catch === "function") {
      response.catch(() => undefined)
    }
  } catch {
    // Popup/background may not be alive. Telemetry is best-effort.
  }
}

function requestMainWorldInjection(): void {
  sendRuntimeMessage({ type: "INJECT_BIONIC_MAIN" })
}

function injectMainWorldScriptTag(): void {
  const inject = () => {
    const parent = document.documentElement || document.head || document.body
    if (!parent) return false

    const script = document.createElement("script")
    script.src = mainWorldScriptUrl
    script.async = false
    script.dataset.cloakDaggerBionicBlur = "main-world"
    parent.appendChild(script)
    script.remove()
    return true
  }

  if (inject()) return
  document.addEventListener("readystatechange", () => inject(), { once: true })
}

function storageGet(keys: string | string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      ext.storage.local.get(keys, (result) => resolve(result ?? {}))
    } catch {
      resolve({})
    }
  })
}

function storageSet(values: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      ext.storage.local.set(values, () => resolve())
    } catch {
      resolve()
    }
  })
}

// Keep the profile builder in the bridge bundle too; this catches obvious seed
// failures during extension smoke tests even though the main world owns patches.
buildPrivacyProfile(location.href, profileSeed)
