// src/shared/shadowAudit.ts
// Digital Shadow Audit — pasywny pomiar realnego fingerprintu przeglądarki.
//
// Uruchamiany w popupie (kontekst rozszerzenia), więc czyta PRAWDZIWE atrybuty
// urządzenia — Bionic Blur podmienia tylko strony WWW (świat MAIN), a nie popup.
// To celowe: pokazujemy użytkownikowi jego rzeczywisty "cień cyfrowy", zanim
// włączy maskowanie.
//
// UCZCIWIE: szacunek entropii jest POGLĄDOWY — korzysta z typowych wartości
// bitów entropii z literatury (Panopticlick / AmIUnique), a nie z pomiaru
// względem realnej, bieżącej populacji. Liczby traktuj jako rząd wielkości.

import { getProfilePreset } from "./bionicBlurCore"
import type { OsFamily, ProfileBucket, ProfileId } from "../types"

export interface ShadowAttribute {
  key: string
  label: string
  value: string
  /** Poglądowa entropia w bitach (typowa wartość literaturowa). */
  bits: number
}

export type ShadowRarity = "low" | "moderate" | "high" | "very-high"

export interface ShadowProfile {
  attributes: ShadowAttribute[]
  totalBits: number
  rarity: ShadowRarity
  /** Poglądowo ~1 na N przeglądarek o tej kombinacji (2^bits). */
  oneInN: number
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    const value = fn()
    return value === undefined || value === null ? fallback : value
  } catch {
    return fallback
  }
}

/** Mały, deterministyczny hash (FNV-1a) — wystarczający do podglądu canvasu. */
function fnv1a(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}

function readCanvasHash(): string | null {
  try {
    const canvas = document.createElement("canvas")
    canvas.width = 240
    canvas.height = 60
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.textBaseline = "top"
    ctx.font = "16px 'Arial'"
    ctx.fillStyle = "#f60"
    ctx.fillRect(0, 0, 100, 30)
    ctx.fillStyle = "#069"
    ctx.fillText("Cloak & Dagger · shadow", 4, 8)
    ctx.fillStyle = "rgba(102,204,0,0.7)"
    ctx.fillText("fingerprint", 6, 28)
    return fnv1a(canvas.toDataURL())
  } catch {
    return null
  }
}

function readWebGL(): { vendor: string; renderer: string } | null {
  try {
    const canvas = document.createElement("canvas")
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null)
    if (!gl) return null
    const dbg = gl.getExtension("WEBGL_debug_renderer_info")
    const renderer = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER))
    const vendor = dbg
      ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL))
      : String(gl.getParameter(gl.VENDOR))
    return { vendor, renderer }
  } catch {
    return null
  }
}

/**
 * Zbiera realny fingerprint i szacuje rozpoznawalność użytkownika.
 * Każdy odczyt jest osłonięty (safe) — w razie braku API atrybut dostaje 0 bitów.
 */
export function collectShadowProfile(): ShadowProfile {
  const attributes: ShadowAttribute[] = []
  const push = (key: string, label: string, value: unknown, bits: number): void => {
    attributes.push({ key, label, value: String(value), bits })
  }

  push("ua", "User-Agent", safe(() => navigator.userAgent, "—"), 10)
  push("platform", "Platforma", safe(() => navigator.platform, "—"), 2)
  push(
    "languages",
    "Języki",
    safe(() => navigator.languages?.join(", ") || navigator.language, "—"),
    2
  )
  push(
    "timezone",
    "Strefa czasowa",
    safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, "—"),
    3
  )
  push(
    "screen",
    "Ekran",
    safe(() => `${screen.width}×${screen.height} @${screen.colorDepth}-bit`, "—"),
    5
  )

  const cores = safe(() => navigator.hardwareConcurrency, 0)
  push("cores", "Rdzenie CPU", cores || "—", cores ? 2 : 0)

  const mem = safe(
    () => (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    undefined
  )
  push("memory", "Pamięć (GB)", mem ?? "—", mem === undefined ? 0 : 2)

  push("touch", "Punkty dotyku", safe(() => navigator.maxTouchPoints, 0), 1)

  const canvasHash = readCanvasHash()
  push("canvas", "Canvas hash", canvasHash ?? "niedostępny", canvasHash ? 8 : 0)

  const webgl = readWebGL()
  push("webgl", "GPU (WebGL)", webgl ? webgl.renderer : "niedostępny", webgl ? 7 : 0)

  const totalBits =
    Math.round(attributes.reduce((sum, a) => sum + a.bits, 0) * 10) / 10
  const oneInN = Math.round(Math.pow(2, totalBits))

  let rarity: ShadowRarity = "low"
  if (totalBits >= 25) rarity = "very-high"
  else if (totalBits >= 18) rarity = "high"
  else if (totalBits >= 11) rarity = "moderate"

  return { attributes, totalBits, rarity, oneInN }
}

// ─── Estymacja maski (stan „po") ──────────────────────────────────────────────
// UCZCIWIE: gdy persona ujednolica profil, wysokoentropijne atrybuty schodzą do
// wartości popularnych w populacji (pospolity Chrome+OS, typowa rozdzielczość,
// 8 rdzeni/8 GB), a canvas/webgl są zaszumiane/podstawiane. Bity są POGLĄDOWE —
// rząd wielkości, nie pomiar względem realnej populacji.

export interface MaskedShadowEstimate {
  /** Tryb wybranej tożsamości. */
  mode: "auto" | "persona" | "custom"
  /** Poglądowe bity entropii maski; null dla rotacji (brak stałego śladu). */
  totalBits: number | null
  /** ≈ 1 na N (2^bits); null dla rotacji. */
  oneInN: number | null
  /** Krótki opis stanu maski do UI. */
  label: string
}

/** Poglądowe bity „maski" per atrybut po ujednoliceniu profilu. */
const MASKED_ATTRIBUTE_BITS: Record<string, number> = {
  ua: 3,
  platform: 1,
  languages: 1,
  timezone: 2,
  screen: 1.5,
  cores: 0.5,
  memory: 0.5,
  touch: 0,
  canvas: 0.5,
  webgl: 1
}

/** Lekka korekta rzadkości wg rodziny OS (Windows najpospolitszy). */
const OS_RARITY_BITS: Record<OsFamily, number> = {
  windows: 0,
  macos: 1.5,
  linux: 2.5
}

const MASKED_BASE_BITS = Object.values(MASKED_ATTRIBUTE_BITS).reduce(
  (sum, bits) => sum + bits,
  0
)

function osFamilyFromPlatform(platform: string): OsFamily {
  if (platform.includes("Mac")) return "macos"
  if (platform.includes("Linux")) return "linux"
  return "windows"
}

/**
 * Szacuje rozpoznawalność PO włączeniu maski dla wybranej tożsamości.
 * - "auto"   → rotacja: brak pojedynczego śladu do połączenia między stronami.
 * - persona  → wartości popularne w populacji → niska, ujednolicona entropia.
 * - "custom" → jw., bazując na rodzinie OS profilu Custom.
 */
export function estimateMaskedShadow(
  profileId: ProfileId,
  customBucket?: ProfileBucket | null
): MaskedShadowEstimate {
  if (profileId === "auto") {
    return {
      mode: "auto",
      totalBits: null,
      oneInN: null,
      label: "Rotacja per-site"
    }
  }

  let os: OsFamily = "windows"
  let mode: "persona" | "custom" = "persona"
  if (profileId === "custom") {
    mode = "custom"
    os = customBucket ? osFamilyFromPlatform(customBucket.platform) : "windows"
  } else {
    os = getProfilePreset(profileId)?.os ?? "windows"
  }

  const totalBits =
    Math.round((MASKED_BASE_BITS + (OS_RARITY_BITS[os] ?? 0)) * 10) / 10
  const oneInN = Math.round(Math.pow(2, totalBits))

  return {
    mode,
    totalBits,
    oneInN,
    label: mode === "custom" ? "Maska Custom" : "Maska aktywna"
  }
}
