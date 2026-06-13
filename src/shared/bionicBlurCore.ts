import type {
  BionicBlurConfig,
  BuildProfileOptions,
  OsFamily,
  PointerLikeFields,
  PrivacyProfile,
  ProfileBucket,
  ProfilePreset,
  ProfilePresetId
} from "../types"

/**
 * Nazwane persony. Każda to JEDEN spójny profil — OS dopasowany do GPU/UA/ekranu/
 * strefy — co zapobiega wykryciu maskowania przez skrypty anty-fraudowe (patrz
 * buildConsistentUserAgent w bionic-blur-main). Wartości techniczne są identyczne
 * z dawnym PROFILE_BUCKETS; doszły tylko id/label/persona dla selektora w popupie.
 */
export const PROFILE_PRESETS: readonly ProfilePreset[] = [
  {
    id: "gaming-win",
    label: "Gaming · Windows",
    persona: "Gracz PC z dedykowaną kartą NVIDIA",
    os: "windows",
    bucket: {
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
    }
  },
  {
    id: "office-win",
    label: "Biuro · Windows",
    persona: "Pracownik biurowy na laptopie z Intel Iris Xe",
    os: "windows",
    bucket: {
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
    }
  },
  {
    id: "creative-mac",
    label: "Kreatywny · macOS",
    persona: "Designer na MacBooku z układem Apple",
    os: "macos",
    bucket: {
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
    }
  },
  {
    id: "dev-linux",
    label: "Developer · Linux",
    persona: "Programista na Linuksie z kartą AMD",
    os: "linux",
    bucket: {
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
  }
] as const

const PRESET_BY_ID = new Map<ProfilePresetId, ProfilePreset>(
  PROFILE_PRESETS.map((preset) => [preset.id, preset])
)

/** Buckety w kolejności presetów — pula losowej rotacji per-site (tryb Auto). */
const PROFILE_BUCKETS: readonly ProfileBucket[] = PROFILE_PRESETS.map(
  (preset) => preset.bucket
)

/** Domyślna rodzina OS dla profilu Custom przy braku jawnego wyboru. */
export const DEFAULT_CUSTOM_OS: OsFamily = "windows"

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

/**
 * Wybiera bucket dla danego ziarna i opcji profilu:
 * - "custom" + customBucket → profil użytkownika,
 * - znany preset           → stała persona,
 * - "auto"/nieznane        → losowa rotacja per-origin (dotychczasowe zachowanie).
 */
function selectBucket(seed: string, options: BuildProfileOptions): ProfileBucket {
  const { profileId, customBucket } = options
  if (profileId === "custom" && customBucket) {
    return customBucket
  }
  if (profileId && profileId !== "auto") {
    const preset = PRESET_BY_ID.get(profileId as ProfilePresetId)
    if (preset) return preset.bucket
  }
  const rng = createSeededRandom(seed)
  return PROFILE_BUCKETS[Math.floor(rng() * PROFILE_BUCKETS.length)]
}

export function buildPrivacyProfile(
  urlOrOrigin: string,
  sessionSeed: string | number = Date.now(),
  options: BuildProfileOptions = {}
): PrivacyProfile {
  const origin = normalizeOrigin(urlOrOrigin)
  // Ziarno zostaje per-origin, więc szum canvas/myszy dalej różni się per stronę
  // nawet przy stałej personie — selectBucket steruje tylko WYBOREM tożsamości.
  const seed = `${origin}:${sessionSeed}`
  const bucket = selectBucket(seed, options)

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

/** Zwraca preset po id (lub undefined dla "auto"/"custom"/nieznanego). */
export function getProfilePreset(
  profileId: string | undefined
): ProfilePreset | undefined {
  if (!profileId) return undefined
  return PRESET_BY_ID.get(profileId as ProfilePresetId)
}

// --- Profil Custom (spójny, budowany z rodziny OS) ---

/** Spójne części GPU/screen dla każdej rodziny OS — baza profilu Custom. */
const CUSTOM_OS_BASE: Record<OsFamily, ProfileBucket> = {
  windows: {
    locale: "en-US",
    timezone: "Europe/Warsaw",
    timezoneOffsetMinutes: -60,
    platform: "Win32",
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    webglVendor: "Google Inc. (Intel)",
    webglRenderer: "ANGLE (Intel, Intel UHD Graphics 770 Direct3D11)"
  },
  macos: {
    locale: "en-US",
    timezone: "America/Los_Angeles",
    timezoneOffsetMinutes: 480,
    platform: "MacIntel",
    screen: { width: 1512, height: 982, colorDepth: 24 },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    webglVendor: "Apple Inc.",
    webglRenderer: "Apple GPU"
  },
  linux: {
    locale: "en-US",
    timezone: "Europe/Berlin",
    timezoneOffsetMinutes: -60,
    platform: "Linux x86_64",
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    webglVendor: "Google Inc. (AMD)",
    webglRenderer: "ANGLE (AMD, AMD Radeon Graphics Vulkan)"
  }
}

/**
 * Buduje spójny ProfileBucket Custom z wybranej rodziny OS plus opcjonalnych
 * nadpisań (locale/strefa/ekran). GPU/platforma zawsze pasują do OS, więc nie
 * powstaje niespójny fingerprint, który sam w sobie zdradza maskowanie.
 */
export function buildCustomBucket(
  os: OsFamily,
  overrides: Partial<Pick<ProfileBucket, "locale" | "timezone" | "timezoneOffsetMinutes">> = {}
): ProfileBucket {
  const base = CUSTOM_OS_BASE[os] ?? CUSTOM_OS_BASE[DEFAULT_CUSTOM_OS]
  return {
    ...base,
    screen: { ...base.screen },
    ...overrides
  }
}

// --- Suwak „Intensywność maski" (Extremity) ---

/** Maksima zgodne z clampami w getBlurredPointerFields/getCoarseTimestamp. */
export const EXTREMITY_MAX_MOUSE_INTENSITY = 12
export const EXTREMITY_MAX_JITTER_MS = 40

/**
 * Mapuje jeden suwak 0–100 na pola zniekształceń dynamicznych konsumowane już
 * przez świat MAIN (mouseIntensity, timestampJitterMs). Brak nowych ścieżek
 * danych — to czysty UI nad istniejącym BionicBlurConfig.
 */
export function extremityToConfig(
  extremity: number
): Pick<BionicBlurConfig, "mouseIntensity" | "timestampJitterMs"> {
  const t = clampNumber(extremity, 0, 100) / 100
  return {
    mouseIntensity: Math.round(t * EXTREMITY_MAX_MOUSE_INTENSITY),
    timestampJitterMs: Math.round(t * EXTREMITY_MAX_JITTER_MS)
  }
}

/** Odwrotność extremityToConfig — hydratuje suwak ze stanu configu (po myszy). */
export function configToExtremity(
  config: Pick<BionicBlurConfig, "mouseIntensity">
): number {
  const t =
    clampNumber(config.mouseIntensity, 0, EXTREMITY_MAX_MOUSE_INTENSITY) /
    EXTREMITY_MAX_MOUSE_INTENSITY
  return Math.round(t * 100)
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
