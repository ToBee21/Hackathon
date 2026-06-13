import type { PlasmoCSConfig } from "plasmo"

import mainWorldScriptUrl from "url:./contents/bionic-blur-main"

import { initializeAiDeepDiveContent } from "./content/aiDeepDive/contentEntry"
import {
  DEFAULT_BIONIC_BLUR_CONFIG,
  buildPrivacyProfile
} from "./shared/bionicBlurCore"
import { requestAliasGeneration } from "./shared/emailAlias"
import type {
  BionicBlurConfig,
  BionicBlurTelemetryMessage,
  FingerprintSurface,
  PrivacyState
} from "./types"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
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

  initializeAiDeepDiveContent(sendRuntimeMessage)
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

// ---------------------------------------------------------------------------
// Email Alias Shield (Module D integration)
// ---------------------------------------------------------------------------

const SHIELD_ATTR = "data-cloak-shield"
const SHIELD_SIZE = 22

function createShieldButton(input: HTMLInputElement): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.title = "Cloak & Dagger: wygeneruj alias e-mail"
  btn.setAttribute(SHIELD_ATTR, "1")
  btn.style.cssText = [
    "position:absolute",
    "z-index:2147483647",
    `width:${SHIELD_SIZE}px`,
    `height:${SHIELD_SIZE}px`,
    "padding:0",
    "border:none",
    "background:none",
    "cursor:pointer",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "opacity:0.85",
    "transition:opacity 0.15s",
  ].join(";")

  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHIELD_SIZE}" height="${SHIELD_SIZE}" viewBox="0 0 24 24" fill="#6366f1" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2"/></svg>`

  btn.addEventListener("mouseenter", () => { btn.style.opacity = "1" })
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.85" })

  btn.addEventListener("click", async (e) => {
    e.preventDefault()
    e.stopPropagation()
    btn.style.opacity = "0.5"
    btn.style.pointerEvents = "none"

    try {
      const alias = await requestAliasGeneration()

      // Fill the input and fire change/input events so React/Vue/etc. detect it
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set
      nativeInputValueSetter?.call(input, alias.alias)
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))

      // Brief green flash to confirm
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHIELD_SIZE}" height="${SHIELD_SIZE}" viewBox="0 0 24 24" fill="#22c55e" stroke="#fff" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2"/></svg>`
      setTimeout(() => {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHIELD_SIZE}" height="${SHIELD_SIZE}" viewBox="0 0 24 24" fill="#6366f1" stroke="#fff" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2"/></svg>`
        btn.style.opacity = "0.85"
        btn.style.pointerEvents = ""
      }, 1500)

      sendRuntimeMessage({
        type: "LOG_EVENT",
        entry: {
          timestamp: Date.now(),
          source: "dataGhost",
          message: `Email alias: wygenerowano ${alias.alias}`,
          count: 1,
        },
      })
    } catch {
      btn.style.opacity = "0.85"
      btn.style.pointerEvents = ""
    }
  })

  return btn
}

function positionShield(btn: HTMLButtonElement, input: HTMLInputElement): void {
  const rect = input.getBoundingClientRect()
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const margin = 4
  btn.style.top = `${rect.top + scrollY + (rect.height - SHIELD_SIZE) / 2}px`
  btn.style.left = `${rect.right + scrollX - SHIELD_SIZE - margin}px`
}

function attachShield(input: HTMLInputElement): void {
  if (input.dataset.cloakShield) return
  input.dataset.cloakShield = "1"

  // Right-pad the input so text doesn't overlap the button
  const existingPadding = parseInt(getComputedStyle(input).paddingRight, 10) || 0
  input.style.paddingRight = `${existingPadding + SHIELD_SIZE + 8}px`

  const btn = createShieldButton(input)

  // Use a wrapper div positioned relative to the document
  const wrapper = document.createElement("div")
  wrapper.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none"
  wrapper.style.pointerEvents = "none"
  btn.style.pointerEvents = "auto"
  wrapper.appendChild(btn)
  document.body.appendChild(wrapper)

  const reposition = () => positionShield(btn, input)
  reposition()

  // Keep button aligned when layout shifts
  const ro = new ResizeObserver(reposition)
  ro.observe(input)
  window.addEventListener("scroll", reposition, { passive: true })
  window.addEventListener("resize", reposition, { passive: true })
}

function scanEmailInputs(): void {
  document.querySelectorAll<HTMLInputElement>(
    'input[type="email"]:not([data-cloak-shield])'
  ).forEach(attachShield)
}

// Run after DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scanEmailInputs)
} else {
  scanEmailInputs()
}

// Watch for dynamically added inputs (SPAs, modals, etc.)
const emailObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue
      if (node.matches?.('input[type="email"]')) {
        attachShield(node as HTMLInputElement)
      }
      node.querySelectorAll?.('input[type="email"]:not([data-cloak-shield])')
        .forEach((el) => attachShield(el as HTMLInputElement))
    }
  }
})

emailObserver.observe(document.documentElement, { childList: true, subtree: true })
