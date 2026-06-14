// src/shared/virtualIdentityStudio.ts
//
// Model danych „Wirtualnej Tożsamości" — kreatora postaci, który konfiguruje
// profil, jaki widzą o nas algorytmy śledzące. To jest WARSTWA LOGIKI (czysta,
// testowalna, bez Reacta): definicje archetypów, parametrów ręcznych oraz
// deterministyczne mapowanie wyboru użytkownika na:
//   • ProfileBucket  → spójny fingerprint sprzętowy (rdzenie / RAM / GPU / ekran /
//                       strefa / język), konsumowany przez bionicBlurCore,
//   • tematy szumu    → kategorie zapytań generatora DataGhost (background.ts).
//
// Dzięki temu zmiana persony w UI nie jest kosmetyczna — przekłada się na realne
// dane wstrzykiwane do sieci.

import type { ProfileBucket } from "../types"

// --- Parametry demograficzne i sprzętowe -----------------------------------

export type Gender = "female" | "male"
export type AgeBand = "teen" | "young-adult" | "adult" | "senior"

/** Trzy przystanki suwaka „Specyfikacja komputera". */
export type HardwareTier = "budget" | "office" | "powerhouse"

/** Cyfrowe pochodzenie — steruje strefą czasową i językami przeglądarki. */
export type OriginId =
  | "us"
  | "uk"
  | "pl"
  | "de"
  | "jp"
  | "br"
  | "ch"
  | "th"
  | "ro"
  | "mt"
  | "pt"
  | "kr"

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
  | "automotive"

export type ArchetypeId =
  | "granny"
  | "connoisseur"
  | "worldcitizen"
  | "shark"
  | "hero"
  | "hermit"
  | "roulette"
  | "petwhisperer"
  | "wavecatcher"
  | "gamer"

/** Pełna konfiguracja wirtualnej tożsamości — jedyne źródło prawdy UI. */
export interface VirtualIdentityConfig {
  /** Wybrany archetyp lub "custom" gdy użytkownik edytował ręcznie. */
  archetypeId: ArchetypeId | "custom"
  gender: Gender
  ageBand: AgeBand
  hardware: HardwareTier
  origin: OriginId
  interests: InterestId[]
}

/** Trzy statystyki pochodne pokazywane suwakami w podglądzie (0–100). */
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
  { id: "teen", label: "Nastolatek", short: "13–19" },
  { id: "young-adult", label: "Młody Dorosły", short: "20–34" },
  { id: "adult", label: "Dorosły", short: "35–59" },
  { id: "senior", label: "Emeryt", short: "60+" }
]

export interface HardwareSpec {
  id: HardwareTier
  label: string
  /** Krótki opis na suwaku. */
  blurb: string
  cores: number
  /** navigator.deviceMemory — przeglądarki raportują maksymalnie 8 GB. */
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
  /** Dwuliterowy kod kraju (zamiast emoji — spójnie z zasadą ikon SVG/tekst). */
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
  },
  {
    id: "ch",
    label: "Szwajcaria · Zurych",
    code: "CH",
    locale: "de-CH",
    languages: ["de-CH", "de", "en"],
    timezone: "Europe/Zurich",
    timezoneOffsetMinutes: -60
  },
  {
    id: "th",
    label: "Tajlandia",
    code: "TH",
    // Anglojęzyczna ekspatka — locale en-US, choć strefa azjatycka.
    locale: "en-US",
    languages: ["en-US", "en"],
    timezone: "Asia/Bangkok",
    timezoneOffsetMinutes: -420
  },
  {
    id: "ro",
    label: "Rumunia · węzeł Tor/VPN",
    code: "RO",
    // Wymuszony en-US dla anonimowości (Tor Browser).
    locale: "en-US",
    languages: ["en-US", "en"],
    timezone: "Europe/Bucharest",
    timezoneOffsetMinutes: -120
  },
  {
    id: "mt",
    label: "Malta",
    code: "MT",
    // Polski gracz operujący z Malty — język pozostaje pl-PL.
    locale: "pl-PL",
    languages: ["pl-PL", "pl", "en"],
    timezone: "Europe/Malta",
    timezoneOffsetMinutes: -60
  },
  {
    id: "pt",
    label: "Portugalia",
    code: "PT",
    locale: "pt-PT",
    languages: ["pt-PT", "pt", "en"],
    timezone: "Europe/Lisbon",
    timezoneOffsetMinutes: 0
  },
  {
    id: "kr",
    label: "Korea Południowa",
    code: "KR",
    locale: "ko-KR",
    languages: ["ko-KR", "ko", "en"],
    timezone: "Asia/Seoul",
    timezoneOffsetMinutes: -540
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
  /** Wkład w statystyki pochodne (0–1 mnożniki na potrzeby heurystyki). */
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
  },
  {
    id: "automotive",
    label: "Motoryzacja",
    noiseCategories: ["technology", "hobbies"],
    weight: { tech: 8, mobility: 10 }
  }
] as const

/**
 * Jawny odcisk sprzętowy nadpisujący wartości pochodne z tieru/origin. Pozwala
 * odwzorować dokładny „Profil dla trackerów" ze specyfikacji (GPU/ekran/platforma),
 * bez rozbijania trzystopniowego suwaka sprzętu. Pola opcjonalne — brak = wartość z tieru.
 */
export interface FingerprintOverride {
  /** Czytelna nazwa GPU pokazywana w podglądzie. */
  gpu: string
  webglVendor: string
  webglRenderer: string
  screen: { width: number; height: number }
  /** navigator.platform — np. "MacIntel", "Linux x86_64", "Linux armv8l". */
  platform?: string
  cores?: number
  deviceMemory?: number
  maxTouchPoints?: number
}

export interface Archetype {
  id: ArchetypeId
  name: string
  tagline: string
  category: "default" | "special"
  config: Omit<VirtualIdentityConfig, "archetypeId">
  /** Klucz modelu 3D mapowany na URL w warstwie React (brak → sylwetka SVG). */
  model3d?: string
  /** Jawny odcisk trackera (GPU/ekran/platforma) ze specyfikacji. */
  fingerprint?: FingerprintOverride
  /** Jawne statystyki pochodne (0–100) zamiast heurystyki deriveStats. */
  stats?: IdentityStats
}

/**
 * Galeria 10 profili person ze specyfikacji „Ślad cyfrowy i jego zaciemnianie".
 * Każdy ma model 3D (poza Hardcore Gamerem — sylwetka SVG), jawny odcisk trackera
 * oraz docelowe statystyki Zamożność/Technika/Mobilność.
 */
export const ARCHETYPES: readonly Archetype[] = [
  {
    id: "granny",
    name: "Babcia w Sieci",
    tagline: "Emerytka na starym laptopie",
    category: "default",
    model3d: "grandma",
    stats: { wealth: 48, tech: 12, mobility: 24 },
    config: {
      gender: "female",
      ageBand: "senior",
      hardware: "budget",
      origin: "pl",
      interests: ["finance", "cooking", "pets"]
    }
  },
  {
    id: "connoisseur",
    name: "Milioner",
    tagline: "Koneser luksusu",
    category: "default",
    model3d: "koneser",
    stats: { wealth: 99, tech: 60, mobility: 85 },
    fingerprint: {
      gpu: "Apple M3 Max",
      webglVendor: "Apple",
      webglRenderer: "ANGLE (Apple, Apple M3 Max, OpenGL 4.1)",
      screen: { width: 3456, height: 2234 },
      platform: "MacIntel",
      cores: 16,
      deviceMemory: 8
    },
    config: {
      gender: "male",
      ageBand: "adult",
      hardware: "powerhouse",
      origin: "ch",
      interests: ["luxury", "finance", "travel"]
    }
  },
  {
    id: "worldcitizen",
    name: "Podróżniczka",
    tagline: "Z laptopem pod azjatyckimi palmami",
    category: "default",
    model3d: "obywatelka",
    stats: { wealth: 65, tech: 80, mobility: 95 },
    fingerprint: {
      gpu: "Intel Iris Xe Graphics",
      webglVendor: "Google Inc. (Intel)",
      webglRenderer:
        "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)",
      screen: { width: 1920, height: 1080 }
    },
    config: {
      gender: "female",
      ageBand: "young-adult",
      hardware: "office",
      origin: "th",
      interests: ["travel", "tech", "sport"]
    }
  },
  {
    id: "shark",
    name: "Inwestor",
    tagline: "Inwestor z apetytem na luksus",
    category: "default",
    model3d: "rekin",
    stats: { wealth: 90, tech: 85, mobility: 20 },
    fingerprint: {
      gpu: "NVIDIA RTX A4000",
      webglVendor: "Google Inc. (NVIDIA)",
      webglRenderer:
        "ANGLE (NVIDIA, NVIDIA RTX A4000 Direct3D11 vs_5_0 ps_5_0)",
      screen: { width: 3840, height: 2160 },
      cores: 16,
      deviceMemory: 8
    },
    config: {
      gender: "male",
      ageBand: "adult",
      hardware: "powerhouse",
      origin: "uk",
      interests: ["finance", "tech", "gambling"]
    }
  },
  {
    id: "hero",
    name: "Strażak",
    tagline: "Zawsze w gotowości, żyje w biegu",
    category: "default",
    model3d: "bohater",
    stats: { wealth: 55, tech: 45, mobility: 80 },
    fingerprint: {
      gpu: "Adreno 730",
      webglVendor: "Qualcomm",
      webglRenderer: "Adreno (TM) 730",
      screen: { width: 1080, height: 2400 },
      platform: "Linux armv8l",
      cores: 8,
      deviceMemory: 8,
      maxTouchPoints: 5
    },
    config: {
      gender: "male",
      ageBand: "young-adult",
      hardware: "office",
      origin: "pl",
      interests: ["sport", "automotive", "tech"]
    }
  },
  {
    id: "hermit",
    name: "Jaskiniowiec",
    tagline: "Człowiek z jaskini",
    category: "default",
    model3d: "pustelnik",
    stats: { wealth: 30, tech: 98, mobility: 10 },
    fingerprint: {
      gpu: "llvmpipe (WebGL zablokowany)",
      webglVendor: "Mesa",
      webglRenderer: "llvmpipe (LLVM 15.0.6, 256 bits)",
      screen: { width: 1366, height: 768 },
      platform: "Linux x86_64",
      cores: 4,
      deviceMemory: 4
    },
    config: {
      gender: "male",
      ageBand: "adult",
      hardware: "budget",
      origin: "ro",
      interests: ["tech"]
    }
  },
  {
    id: "roulette",
    name: "Król Ruletki",
    tagline: "Nocny łowca jackpotów i darmowych spinów",
    category: "default",
    model3d: "krol",
    stats: { wealth: 40, tech: 60, mobility: 40 },
    fingerprint: {
      gpu: "AMD Radeon RX 580",
      webglVendor: "Google Inc. (AMD)",
      webglRenderer:
        "ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)",
      screen: { width: 1920, height: 1080 }
    },
    config: {
      gender: "male",
      ageBand: "young-adult",
      hardware: "office",
      origin: "mt",
      interests: ["gambling", "finance", "sport"]
    }
  },
  {
    id: "petwhisperer",
    name: "Miłośniczka Zwierząt",
    tagline: "Algorytm zasypany słodkimi kotkami",
    category: "default",
    model3d: "zaklinacz",
    stats: { wealth: 45, tech: 35, mobility: 60 },
    fingerprint: {
      gpu: "Intel UHD Graphics 620",
      webglVendor: "Google Inc. (Intel)",
      webglRenderer:
        "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)",
      screen: { width: 1536, height: 864 }
    },
    config: {
      gender: "female",
      ageBand: "young-adult",
      hardware: "budget",
      origin: "pl",
      interests: ["pets", "cooking", "travel"]
    }
  },
  {
    id: "wavecatcher",
    name: "Surfer",
    tagline: "Wyluzowany poszukiwacz dobrego wiatru",
    category: "default",
    model3d: "lapacz",
    stats: { wealth: 60, tech: 50, mobility: 90 },
    fingerprint: {
      gpu: "Apple M1",
      webglVendor: "Apple",
      webglRenderer: "ANGLE (Apple, Apple M1, OpenGL 4.1)",
      screen: { width: 2560, height: 1600 },
      platform: "MacIntel",
      cores: 8,
      deviceMemory: 8
    },
    config: {
      gender: "male",
      ageBand: "young-adult",
      hardware: "office",
      origin: "pt",
      interests: ["sport", "travel", "luxury"]
    }
  },
  {
    id: "gamer",
    name: "Gamer",
    tagline: "Prawdziwy komputerowiec",
    category: "default",
    model3d: "gamer",
    stats: { wealth: 35, tech: 75, mobility: 15 },
    fingerprint: {
      gpu: "NVIDIA GeForce RTX 3060",
      webglVendor: "Google Inc. (NVIDIA)",
      webglRenderer:
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)",
      screen: { width: 2560, height: 1440 },
      cores: 12,
      deviceMemory: 8
    },
    config: {
      gender: "male",
      ageBand: "teen",
      hardware: "powerhouse",
      origin: "kr",
      interests: ["gaming", "tech", "sport"]
    }
  }
] as const

const ARCHETYPE_BY_ID = new Map<ArchetypeId, Archetype>(
  ARCHETYPES.map((a) => [a.id, a])
)

// --- Wartości domyślne i lookupy -------------------------------------------

export const DEFAULT_IDENTITY: VirtualIdentityConfig = {
  archetypeId: "granny",
  ...ARCHETYPES.find((a) => a.id === "granny")!.config
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

/** Indeks suwaka sprzętu (0–2) ↔ HardwareTier. */
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
 * sumy wag zainteresowań. Wynik clampowany do 0–100. Czysto heurystyczne —
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
 * RAM/GPU/ekranem, a pochodzenie — językiem i strefą. To jest dokładnie ten kształt,
 * który konsumuje bionicBlurCore jako profil Custom.
 */
export function identityToProfileBucket(config: VirtualIdentityConfig): ProfileBucket {
  const hw = getHardwareSpec(config.hardware)
  const origin = getOriginSpec(config.origin)
  // Jawny odcisk z archetypu (jeśli aktywny) nadpisuje wartości pochodne z tieru,
  // dzięki czemu profil wstrzykiwany do sieci odpowiada specyfikacji 1:1.
  const fp =
    config.archetypeId !== "custom"
      ? getArchetype(config.archetypeId)?.fingerprint
      : undefined
  const screen = fp?.screen ?? hw.screen
  return {
    locale: origin.locale,
    timezone: origin.timezone,
    timezoneOffsetMinutes: origin.timezoneOffsetMinutes,
    platform: fp?.platform ?? "Win32",
    screen: { width: screen.width, height: screen.height, colorDepth: 24 },
    hardwareConcurrency: fp?.cores ?? hw.cores,
    deviceMemory: fp?.deviceMemory ?? hw.deviceMemory,
    maxTouchPoints: fp?.maxTouchPoints ?? 0,
    webglVendor: fp?.webglVendor ?? hw.webglVendor,
    webglRenderer: fp?.webglRenderer ?? hw.webglRenderer
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
