// src/shared/virtualIdentityStudio.ts
//
// Model danych „Wirtualnej Tożsamości"  -  kreatora postaci, który konfiguruje
// profil, jaki widzą o nas algorytmy śledzące. To jest WARSTWA LOGIKI (czysta,
// testowalna, bez Reacta): definicje archetypów, parametrów ręcznych oraz
// deterministyczne mapowanie wyboru użytkownika na:
//   • ProfileBucket  → spójny fingerprint sprzętowy (rdzenie / RAM / GPU / ekran /
//                       strefa / język), konsumowany przez bionicBlurCore,
//   • tematy szumu    → kategorie zapytań generatora DataGhost (background.ts).
//
// Dzięki temu zmiana persony w UI nie jest kosmetyczna  -  przekłada się na realne
// dane wstrzykiwane do sieci.

import type { ProfileBucket } from "../types"

// --- Parametry demograficzne i sprzętowe -----------------------------------

export type Gender = "female" | "male"
export type AgeBand = "teen" | "young-adult" | "adult" | "senior"

/** Trzy przystanki suwaka „Specyfikacja komputera". */
export type HardwareTier = "budget" | "office" | "powerhouse"

/** Cyfrowe pochodzenie  -  steruje strefą czasową i językami przeglądarki. */
export type OriginId = "us" | "uk" | "pl" | "de" | "jp" | "br"

/** Obszary tematyczne szumu sieciowego (tagi zainteresowań). */
export type InterestId =
  | "finance"
  | "tech"
  | "luxury"
  | "cooking"
  | "pets"
  | "gaming"
  | "sport"
  | "travel"
  | "gambling"

export type ArchetypeId =
  // Domyślne
  | "nomad"
  | "shark"
  | "gamer"
  | "granny"
  // Specjalne
  | "ghost"
  | "influencer"
  | "hacker"
  | "everyman"

/** Pełna konfiguracja wirtualnej tożsamości  -  jedyne źródło prawdy UI. */
export interface VirtualIdentityConfig {
  /** Wybrany archetyp lub "custom" gdy użytkownik edytował ręcznie. */
  archetypeId: ArchetypeId | "custom"
  gender: Gender
  ageBand: AgeBand
  hardware: HardwareTier
  origin: OriginId
  interests: InterestId[]
}

/** Trzy statystyki pochodne pokazywane suwakami w podglądzie (0-100). */
export interface IdentityStats {
  /** Zamożność. */
  wealth: number
  /** Zaawansowanie techniczne. */
  tech: number
  /** Mobilność. */
  mobility: number
}

// --- Tabele opisowe (etykiety PL dla UI) -----------------------------------

export const GENDERS: { id: Gender; label: string }[] = [
  { id: "female", label: "Kobieta" },
  { id: "male", label: "Mężczyzna" }
]

export const AGE_BANDS: { id: AgeBand; label: string; short: string }[] = [
  { id: "teen", label: "Nastolatek", short: "13-19" },
  { id: "young-adult", label: "Młody Dorosły", short: "20-34" },
  { id: "adult", label: "Dorosły", short: "35-59" },
  { id: "senior", label: "Emeryt", short: "60+" }
]

export interface HardwareSpec {
  id: HardwareTier
  label: string
  /** Krótki opis na suwaku. */
  blurb: string
  cores: number
  /** navigator.deviceMemory  -  przeglądarki raportują maksymalnie 8 GB. */
  deviceMemory: number
  /** Realna ilość RAM do pokazania użytkownikowi (GB). */
  ramGb: number
  gpu: string
  webglVendor: string
  webglRenderer: string
  screen: { width: number; height: number; colorDepth: number }
}

/** Suwak sprzętu: indeks 0 → 1 → 2 mapuje na te trzy progi. */
export const HARDWARE_TIERS: readonly HardwareSpec[] = [
  {
    id: "budget",
    label: "Tani, stary laptop",
    blurb: "2 rdzenie · 4 GB RAM · zintegrowana grafika",
    cores: 2,
    deviceMemory: 4,
    ramGb: 4,
    gpu: "Intel HD Graphics 620",
    webglVendor: "Google Inc. (Intel)",
    webglRenderer: "ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0)",
    screen: { width: 1366, height: 768, colorDepth: 24 }
  },
  {
    id: "office",
    label: "Standardowy komputer biurowy",
    blurb: "8 rdzeni · 8 GB RAM · Intel Iris Xe",
    cores: 8,
    deviceMemory: 8,
    ramGb: 8,
    gpu: "Intel Iris Xe",
    webglVendor: "Google Inc. (Intel)",
    webglRenderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)",
    screen: { width: 1920, height: 1080, colorDepth: 24 }
  },
  {
    id: "powerhouse",
    label: "Potężna maszyna do gier/pracy",
    blurb: "16 rdzeni · 32 GB RAM · NVIDIA RTX 4070",
    cores: 16,
    deviceMemory: 8, // clamp przeglądarki: deviceMemory nigdy nie przekracza 8
    ramGb: 32,
    gpu: "NVIDIA GeForce RTX 4070",
    webglVendor: "Google Inc. (NVIDIA)",
    webglRenderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0)",
    screen: { width: 2560, height: 1440, colorDepth: 24 }
  }
] as const

export interface OriginSpec {
  id: OriginId
  label: string
  /** Dwuliterowy kod kraju (zamiast emoji  -  spójnie z zasadą ikon SVG/tekst). */
  code: string
  locale: string
  /** Pełny zestaw języków Accept-Language. */
  languages: string[]
  timezone: string
  /** Konwencja getTimezoneOffset(): dodatni = na zachód od UTC. */
  timezoneOffsetMinutes: number
}

export const ORIGINS: readonly OriginSpec[] = [
  {
    id: "us",
    label: "USA · Nowy Jork",
    code: "US",
    locale: "en-US",
    languages: ["en-US", "en"],
    timezone: "America/New_York",
    timezoneOffsetMinutes: 300
  },
  {
    id: "uk",
    label: "Wielka Brytania",
    code: "GB",
    locale: "en-GB",
    languages: ["en-GB", "en"],
    timezone: "Europe/London",
    timezoneOffsetMinutes: 0
  },
  {
    id: "pl",
    label: "Polska",
    code: "PL",
    locale: "pl-PL",
    languages: ["pl-PL", "pl", "en-US", "en"],
    timezone: "Europe/Warsaw",
    timezoneOffsetMinutes: -60
  },
  {
    id: "de",
    label: "Niemcy",
    code: "DE",
    locale: "de-DE",
    languages: ["de-DE", "de", "en"],
    timezone: "Europe/Berlin",
    timezoneOffsetMinutes: -60
  },
  {
    id: "jp",
    label: "Japonia · Tokio",
    code: "JP",
    locale: "ja-JP",
    languages: ["ja-JP", "ja", "en"],
    timezone: "Asia/Tokyo",
    timezoneOffsetMinutes: -540
  },
  {
    id: "br",
    label: "Brazylia",
    code: "BR",
    locale: "pt-BR",
    languages: ["pt-BR", "pt", "en"],
    timezone: "America/Sao_Paulo",
    timezoneOffsetMinutes: 180
  }
] as const

export interface InterestSpec {
  id: InterestId
  label: string
  /**
   * Kategorie z KEYWORD_POOL generatora DataGhost (background.ts), które ten tag
   * aktywuje. Dzięki temu szum sieciowy realnie odzwierciedla wybraną personę.
   */
  noiseCategories: string[]
  /** Wkład w statystyki pochodne (0-1 mnożniki na potrzeby heurystyki). */
  weight: Partial<IdentityStats>
}

export const INTERESTS: readonly InterestSpec[] = [
  {
    id: "finance",
    label: "Finanse",
    noiseCategories: ["finance"],
    weight: { wealth: 14, tech: 6 }
  },
  {
    id: "tech",
    label: "Nowe Technologie",
    noiseCategories: ["technology", "science"],
    weight: { tech: 20 }
  },
  {
    id: "luxury",
    label: "Luksus",
    noiseCategories: ["finance", "culture"],
    weight: { wealth: 24, mobility: 6 }
  },
  {
    id: "cooking",
    label: "Gotowanie",
    noiseCategories: ["cooking"],
    weight: { wealth: 2 }
  },
  {
    id: "pets",
    label: "Zwierzęta",
    noiseCategories: ["hobbies", "health"],
    weight: {}
  },
  {
    id: "gaming",
    label: "Gry",
    noiseCategories: ["technology", "hobbies"],
    weight: { tech: 14 }
  },
  {
    id: "sport",
    label: "Sport",
    noiseCategories: ["fitness", "health"],
    weight: { mobility: 14 }
  },
  {
    id: "travel",
    label: "Podróże",
    noiseCategories: ["travel"],
    weight: { mobility: 28, wealth: 8 }
  },
  {
    id: "gambling",
    label: "Hazard",
    noiseCategories: ["finance"],
    weight: { wealth: 8 }
  }
] as const

export interface Archetype {
  id: ArchetypeId
  name: string
  tagline: string
  category: "default" | "special"
  config: Omit<VirtualIdentityConfig, "archetypeId">
}

/** Gotowe postacie. „default" = realistyczne, „special" = ekstremalne/taktyczne. */
export const ARCHETYPES: readonly Archetype[] = [
  {
    id: "nomad",
    name: "Cyfrowy Nomada",
    tagline: "Freelancer w ciągłej podróży",
    category: "default",
    config: {
      gender: "female",
      ageBand: "young-adult",
      hardware: "office",
      origin: "uk",
      interests: ["travel", "tech", "cooking"]
    }
  },
  {
    id: "shark",
    name: "Rekin Finansjery",
    tagline: "Inwestor z apetytem na luksus",
    category: "default",
    config: {
      gender: "male",
      ageBand: "adult",
      hardware: "powerhouse",
      origin: "us",
      interests: ["finance", "luxury", "travel"]
    }
  },
  {
    id: "gamer",
    name: "Hardcore Gamer",
    tagline: "Nastolatek przy maszynie do gier",
    category: "default",
    config: {
      gender: "male",
      ageBand: "teen",
      hardware: "powerhouse",
      origin: "de",
      interests: ["gaming", "tech", "sport"]
    }
  },
  {
    id: "granny",
    name: "Babcia w Sieci",
    tagline: "Emerytka na starym laptopie",
    category: "default",
    config: {
      gender: "female",
      ageBand: "senior",
      hardware: "budget",
      origin: "pl",
      interests: ["cooking", "pets", "finance"]
    }
  },
  {
    id: "ghost",
    name: "Widmo",
    tagline: "Maksymalny szum, zero wzorca",
    category: "special",
    config: {
      gender: "male",
      ageBand: "adult",
      hardware: "office",
      origin: "jp",
      interests: ["finance", "tech", "luxury", "gaming", "sport", "travel", "gambling"]
    }
  },
  {
    id: "influencer",
    name: "Influencer Lux",
    tagline: "Życie w blasku fleszy",
    category: "special",
    config: {
      gender: "female",
      ageBand: "young-adult",
      hardware: "powerhouse",
      origin: "us",
      interests: ["luxury", "travel", "sport"]
    }
  },
  {
    id: "hacker",
    name: "Haker z Piwnicy",
    tagline: "Linux, kawa i terminal",
    category: "special",
    config: {
      gender: "male",
      ageBand: "young-adult",
      hardware: "powerhouse",
      origin: "de",
      interests: ["tech", "gaming", "finance"]
    }
  },
  {
    id: "everyman",
    name: "Zwykły Kowalski",
    tagline: "Najczęstszy profil  -  rozpływa się w tłumie",
    category: "default",
    config: {
      gender: "male",
      ageBand: "adult",
      hardware: "office",
      origin: "us",
      interests: ["cooking", "sport", "finance"]
    }
  }
] as const

const ARCHETYPE_BY_ID = new Map<ArchetypeId, Archetype>(
  ARCHETYPES.map((a) => [a.id, a])
)

// --- Wartości domyślne i lookupy -------------------------------------------

export const DEFAULT_IDENTITY: VirtualIdentityConfig = {
  archetypeId: "everyman",
  ...ARCHETYPES.find((a) => a.id === "everyman")!.config
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function getHardwareSpec(id: HardwareTier): HardwareSpec {
  return HARDWARE_TIERS.find((h) => h.id === id) ?? HARDWARE_TIERS[1]
}

export function getOriginSpec(id: OriginId): OriginSpec {
  return ORIGINS.find((o) => o.id === id) ?? ORIGINS[0]
}

export function getInterestSpec(id: InterestId): InterestSpec | undefined {
  return INTERESTS.find((i) => i.id === id)
}

export function getArchetype(id: ArchetypeId): Archetype | undefined {
  return ARCHETYPE_BY_ID.get(id)
}

const GENDER_IDS = new Set<Gender>(GENDERS.map((g) => g.id))
const AGE_BAND_IDS = new Set<AgeBand>(AGE_BANDS.map((a) => a.id))
const HARDWARE_IDS = new Set<HardwareTier>(HARDWARE_TIERS.map((h) => h.id))
const ORIGIN_IDS = new Set<OriginId>(ORIGINS.map((o) => o.id))
const INTEREST_IDS = new Set<InterestId>(INTERESTS.map((i) => i.id))

function readKnown<T extends string>(
  value: unknown,
  known: ReadonlySet<T>,
  fallback: T
): T {
  return typeof value === "string" && known.has(value as T) ? (value as T) : fallback
}

function readInterestList(value: unknown): InterestId[] {
  const raw = Array.isArray(value) ? value : DEFAULT_IDENTITY.interests
  const result: InterestId[] = []
  for (const item of raw) {
    if (typeof item !== "string") continue
    const id = item as InterestId
    if (INTEREST_IDS.has(id) && !result.includes(id)) result.push(id)
  }
  return result
}

/** Normalizes untrusted storage data before it affects fingerprint or noise state. */
export function normalizeVirtualIdentityConfig(value: unknown): VirtualIdentityConfig {
  const source = value && typeof value === "object"
    ? (value as Partial<VirtualIdentityConfig>)
    : {}

  const base = {
    gender: readKnown(source.gender, GENDER_IDS, DEFAULT_IDENTITY.gender),
    ageBand: readKnown(source.ageBand, AGE_BAND_IDS, DEFAULT_IDENTITY.ageBand),
    hardware: readKnown(source.hardware, HARDWARE_IDS, DEFAULT_IDENTITY.hardware),
    origin: readKnown(source.origin, ORIGIN_IDS, DEFAULT_IDENTITY.origin),
    interests: readInterestList(source.interests)
  }

  const normalized = reconcileArchetype(base)
  if (source.archetypeId === "custom") return { ...normalized, archetypeId: "custom" }
  return normalized
}

/** Indeks suwaka sprzętu (0-2) ↔ HardwareTier. */
export const HARDWARE_INDEX: Record<HardwareTier, number> = {
  budget: 0,
  office: 1,
  powerhouse: 2
}
export function hardwareFromIndex(index: number): HardwareTier {
  return (HARDWARE_TIERS[clamp(Math.round(index), 0, 2)] ?? HARDWARE_TIERS[1]).id
}

// --- Statystyki pochodne (zamożność / technika / mobilność) ----------------

const HARDWARE_BASE: Record<HardwareTier, IdentityStats> = {
  budget: { wealth: 22, tech: 28, mobility: 40 },
  office: { wealth: 50, tech: 55, mobility: 34 },
  powerhouse: { wealth: 78, tech: 90, mobility: 22 }
}

const AGE_MOD: Record<AgeBand, Partial<IdentityStats>> = {
  teen: { wealth: -12, tech: 10, mobility: 12 },
  "young-adult": { wealth: -2, tech: 6, mobility: 16 },
  adult: { wealth: 8, tech: 0, mobility: 0 },
  senior: { wealth: 10, tech: -22, mobility: -16 }
}

/**
 * Liczy trzy statystyki pochodne z bazy sprzętowej + modyfikatora wieku +
 * sumy wag zainteresowań. Wynik clampowany do 0-100. Czysto heurystyczne  - 
 * służy tylko jako czytelny feedback w podglądzie postaci.
 */
export function deriveStats(config: VirtualIdentityConfig): IdentityStats {
  const base = HARDWARE_BASE[config.hardware]
  const age = AGE_MOD[config.ageBand]
  const acc: IdentityStats = {
    wealth: base.wealth + (age.wealth ?? 0),
    tech: base.tech + (age.tech ?? 0),
    mobility: base.mobility + (age.mobility ?? 0)
  }
  for (const id of config.interests) {
    const w = getInterestSpec(id)?.weight
    if (!w) continue
    acc.wealth += w.wealth ?? 0
    acc.tech += w.tech ?? 0
    acc.mobility += w.mobility ?? 0
  }
  return {
    wealth: clamp(Math.round(acc.wealth), 0, 100),
    tech: clamp(Math.round(acc.tech), 0, 100),
    mobility: clamp(Math.round(acc.mobility), 0, 100)
  }
}

// --- Mapowanie na realne dane ----------------------------------------------

/**
 * Buduje spójny ProfileBucket z konfiguracji tożsamości: sprzęt steruje rdzeniami/
 * RAM/GPU/ekranem, a pochodzenie  -  językiem i strefą. To jest dokładnie ten kształt,
 * który konsumuje bionicBlurCore jako profil Custom.
 */
export function identityToProfileBucket(config: VirtualIdentityConfig): ProfileBucket {
  const hw = getHardwareSpec(config.hardware)
  const origin = getOriginSpec(config.origin)
  return {
    locale: origin.locale,
    timezone: origin.timezone,
    timezoneOffsetMinutes: origin.timezoneOffsetMinutes,
    platform: "Win32",
    screen: { ...hw.screen },
    hardwareConcurrency: hw.cores,
    deviceMemory: hw.deviceMemory,
    maxTouchPoints: 0,
    webglVendor: hw.webglVendor,
    webglRenderer: hw.webglRenderer
  }
}

/**
 * Zbiera unikalne kategorie szumu DataGhost aktywowane przez wybrane
 * zainteresowania. Przy braku zaznaczeń zwraca pustą listę (generator wraca
 * wtedy do pełnej, neutralnej puli).
 */
export function identityToNoiseTopics(config: VirtualIdentityConfig): string[] {
  const set = new Set<string>()
  for (const id of config.interests) {
    for (const cat of getInterestSpec(id)?.noiseCategories ?? []) {
      set.add(cat)
    }
  }
  return [...set]
}

/** Głębokie porównanie dwóch konfiguracji (kolejność zainteresowań bez znaczenia). */
export function identityEquals(
  a: VirtualIdentityConfig | null | undefined,
  b: VirtualIdentityConfig | null | undefined
): boolean {
  if (!a || !b) return a === b
  return (
    a.archetypeId === b.archetypeId &&
    a.gender === b.gender &&
    a.ageBand === b.ageBand &&
    a.hardware === b.hardware &&
    a.origin === b.origin &&
    a.interests.length === b.interests.length &&
    a.interests.every((i) => b.interests.includes(i))
  )
}

/** Czy bieżąca konfiguracja dokładnie odpowiada danemu archetypowi. */
export function matchesArchetype(
  config: VirtualIdentityConfig,
  archetype: Archetype
): boolean {
  const c = archetype.config
  return (
    config.gender === c.gender &&
    config.ageBand === c.ageBand &&
    config.hardware === c.hardware &&
    config.origin === c.origin &&
    config.interests.length === c.interests.length &&
    config.interests.every((i) => c.interests.includes(i))
  )
}

/** Nakłada archetyp na konfigurację (ustawia archetypeId i wszystkie pola). */
export function applyArchetype(archetype: Archetype): VirtualIdentityConfig {
  return { archetypeId: archetype.id, ...archetype.config }
}

/**
 * Po ręcznej edycji: jeśli nowy stan pasuje do istniejącego archetypu, oznacz go;
 * w przeciwnym razie przełącz na "custom". Trzyma znacznik presetu w synchronie.
 */
export function reconcileArchetype(
  config: Omit<VirtualIdentityConfig, "archetypeId">
): VirtualIdentityConfig {
  const match = ARCHETYPES.find((a) => matchesArchetype({ ...config, archetypeId: "custom" }, a))
  return { ...config, archetypeId: match ? match.id : "custom" }
}
