import type {
  BionicBlurConfig,
  PointerLikeFields,
  PrivacyProfile
} from "../types"

const PROFILE_BUCKETS = [
  {
    locale: "en-US",
    timezone: "America/New_York",
    timezoneOffsetMinutes: 300,
    platform: "Win32",
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    webglVendor: "Google Inc. (NVIDIA)",
    webglRenderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11)"
  },
  {
    locale: "pl-PL",
    timezone: "Europe/Warsaw",
    timezoneOffsetMinutes: -60,
    platform: "Win32",
    screen: { width: 1536, height: 864, colorDepth: 24 },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    webglVendor: "Google Inc. (Intel)",
    webglRenderer: "ANGLE (Intel, Intel Iris Xe Graphics Direct3D11)"
  },
  {
    locale: "en-GB",
    timezone: "Europe/London",
    timezoneOffsetMinutes: 0,
    platform: "MacIntel",
    screen: { width: 1440, height: 900, colorDepth: 24 },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    webglVendor: "Apple Inc.",
    webglRenderer: "Apple GPU"
  },
  {
    locale: "de-DE",
    timezone: "Europe/Berlin",
    timezoneOffsetMinutes: -60,
    platform: "Linux x86_64",
    screen: { width: 1366, height: 768, colorDepth: 24 },
    hardwareConcurrency: 4,
    deviceMemory: 4,
    maxTouchPoints: 0,
    webglVendor: "Google Inc. (AMD)",
    webglRenderer: "ANGLE (AMD, AMD Radeon Graphics Vulkan)"
  }
] as const

export const DEFAULT_BIONIC_BLUR_CONFIG: BionicBlurConfig = {
  isEnabled: true,
  mouseEnabled: true,
  keyboardEnabled: true,
  fingerprintEnabled: true,
  browserGuardEnabled: true,
  mouseIntensity: 3,
  timestampJitterMs: 12,
  excludedHosts: [],
  debugMode: false
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function normalizeOrigin(input: string): string {
  try {
    return new URL(input).origin
  } catch {
    return input.split(/[/?#]/, 1)[0] || "unknown-origin"
  }
}

export function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function createSeededRandom(seed: string): () => number {
  let state = hashString(seed) || 0x9e3779b9
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildPrivacyProfile(
  urlOrOrigin: string,
  sessionSeed: string | number = Date.now()
): PrivacyProfile {
  const origin = normalizeOrigin(urlOrOrigin)
  const seed = `${origin}:${sessionSeed}`
  const rng = createSeededRandom(seed)
  const bucket = PROFILE_BUCKETS[Math.floor(rng() * PROFILE_BUCKETS.length)]

  return {
    seed,
    origin,
    locale: bucket.locale,
    timezone: bucket.timezone,
    timezoneOffsetMinutes: bucket.timezoneOffsetMinutes,
    platform: bucket.platform,
    screen: { ...bucket.screen },
    hardwareConcurrency: bucket.hardwareConcurrency,
    deviceMemory: bucket.deviceMemory,
    maxTouchPoints: bucket.maxTouchPoints,
    webglVendor: bucket.webglVendor,
    webglRenderer: bucket.webglRenderer
  }
}

function valueNoise(seed: string, x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const fadeX = xf * xf * (3 - 2 * xf)
  const fadeY = yf * yf * (3 - 2 * yf)

  const sample = (sx: number, sy: number) => {
    const rng = createSeededRandom(`${seed}:${sx}:${sy}`)
    return rng() * 2 - 1
  }

  const a = sample(xi, yi)
  const b = sample(xi + 1, yi)
  const c = sample(xi, yi + 1)
  const d = sample(xi + 1, yi + 1)
  const top = a + (b - a) * fadeX
  const bottom = c + (d - c) * fadeX
  return top + (bottom - top) * fadeY
}

function roundNoise(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function getBlurredPointerFields(
  fields: PointerLikeFields,
  profile: PrivacyProfile,
  config: Pick<BionicBlurConfig, "mouseIntensity" | "timestampJitterMs">
): PointerLikeFields {
  const intensity = clampNumber(config.mouseIntensity, 0, 12)
  const scale = 54
  const dx = roundNoise(
    valueNoise(profile.seed, fields.clientX / scale, fields.clientY / scale) *
      intensity
  )
  const dy = roundNoise(
    valueNoise(
      `${profile.seed}:y`,
      fields.clientY / scale,
      fields.clientX / scale
    ) * intensity
  )

  return {
    clientX: fields.clientX + dx,
    clientY: fields.clientY + dy,
    pageX: fields.pageX + dx,
    pageY: fields.pageY + dy,
    screenX: fields.screenX + dx,
    screenY: fields.screenY + dy,
    movementX: fields.movementX + roundNoise(dx * 0.35),
    movementY: fields.movementY + roundNoise(dy * 0.35)
  }
}

export function getCoarseTimestamp(
  timestamp: number,
  profile: PrivacyProfile,
  maxJitterMs: number
): number {
  const jitter = clampNumber(maxJitterMs, 0, 50)
  if (jitter === 0) return timestamp
  const bucket = Math.floor(timestamp / 32)
  const rng = createSeededRandom(`${profile.seed}:time:${bucket}`)
  const offset = (rng() * 2 - 1) * jitter
  return Math.round((timestamp + offset) * 1000) / 1000
}

export function shouldProtectHost(config: BionicBlurConfig, host: string): boolean {
  if (!config.isEnabled) return false
  return !config.excludedHosts.some((entry) => {
    const normalized = entry.trim().toLowerCase()
    return normalized.length > 0 && host.toLowerCase().endsWith(normalized)
  })
}
