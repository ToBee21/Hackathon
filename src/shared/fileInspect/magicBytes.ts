// src/shared/fileInspect/magicBytes.ts
// Stage-1 magic-byte / type-confusion / polyglot detection.
// CZYSTY, deterministyczny moduł: na wejściu bajty już pobranego pliku + nazwa,
// na wyjściu MagicResult (sygnały + fakty). Zero sieci, zero DOM.
//
// Wykrywamy NIEZGODNOŚĆ STRUKTURY: rozszerzenie kłamie o zawartości
// (np. .pdf z programem PE/MZ w środku) oraz polygloty (dwie ważne sygnatury).

import type { FileSignal, MagicResult } from "./types"

/** Sygnatura: bajty oczekiwane na danym offsecie. */
interface Signature {
  type: string
  /** Lista alternatywnych wzorców bajtów dla tego typu (match na offsecie 0). */
  patterns: number[][]
}

// Kolejność MA znaczenie — detectedType to PIERWSZE dopasowanie.
const SIGNATURES: Signature[] = [
  { type: "pdf", patterns: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
  {
    type: "zip",
    patterns: [
      [0x50, 0x4b, 0x03, 0x04],
      [0x50, 0x4b, 0x05, 0x06],
      [0x50, 0x4b, 0x07, 0x08]
    ]
  },
  { type: "pe", patterns: [[0x4d, 0x5a]] }, // MZ
  { type: "ole", patterns: [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]] },
  { type: "png", patterns: [[0x89, 0x50, 0x4e, 0x47]] },
  { type: "gif", patterns: [[0x47, 0x49, 0x46, 0x38]] }, // GIF8
  { type: "jpg", patterns: [[0xff, 0xd8, 0xff]] },
  { type: "rar", patterns: [[0x52, 0x61, 0x72, 0x21]] }, // Rar!
  { type: "7z", patterns: [[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]] },
  { type: "elf", patterns: [[0x7f, 0x45, 0x4c, 0x46]] },
  { type: "rtf", patterns: [[0x7b, 0x5c, 0x72, 0x74, 0x66]] }, // {\rtf
  { type: "gzip", patterns: [[0x1f, 0x8b]] }
]

// Rozszerzenie → oczekiwana rodzina typów (po sygnaturze).
const EXTENSION_FAMILY: Record<string, string[]> = {
  pdf: ["pdf"],
  docx: ["zip"],
  xlsx: ["zip"],
  pptx: ["zip"],
  docm: ["zip"],
  xlsm: ["zip"],
  doc: ["ole"],
  xls: ["ole"],
  ppt: ["ole"],
  zip: ["zip"],
  rar: ["rar"],
  "7z": ["7z"],
  png: ["png"],
  jpg: ["jpg"],
  jpeg: ["jpg"],
  gif: ["gif"],
  exe: ["pe"],
  scr: ["pe"],
  dll: ["pe"],
  rtf: ["rtf", "ole"],
  gz: ["gzip"]
}

// Rozszerzenia, dla których plik wykonywalny w środku = masquerade.
const DOC_IMAGE_EXTS = new Set([
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "docm",
  "xlsm",
  "doc",
  "xls",
  "ppt",
  "rtf",
  "png",
  "jpg",
  "jpeg",
  "gif"
])

/** Czy bajty `bytes` zaczynają się (na offsecie 0) wzorcem `pattern`. */
function matchesAt0(bytes: Uint8Array, pattern: number[]): boolean {
  if (bytes.length < pattern.length) return false
  for (let i = 0; i < pattern.length; i++) {
    if (bytes[i] !== pattern[i]) return false
  }
  return true
}

/** Dekoduje bajty jako latin1 (1 bajt = 1 znak) dla wyszukiwania sygnatur. */
function toLatin1(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i])
  }
  return out
}

/** Czy wzorzec występuje gdziekolwiek POZA offsetem 0 (od indeksu 1). */
function containsAfterStart(haystack: string, needle: string): boolean {
  return haystack.indexOf(needle, 1) !== -1
}

export function inspectMagic(bytes: Uint8Array, filename: string): MagicResult {
  // 1) detectedType — pierwsze dopasowanie sygnatury na offsecie 0.
  let detectedType: string | null = null
  for (const sig of SIGNATURES) {
    if (sig.patterns.some((p) => matchesAt0(bytes, p))) {
      detectedType = sig.type
      break
    }
  }

  // 2) declaredExtension — substring po ostatniej kropce, lowercase.
  const dot = filename.lastIndexOf(".")
  const declaredExtension =
    dot === -1 ? "" : filename.slice(dot + 1).toLowerCase()

  const signals: FileSignal[] = []

  // 3) mismatch — sygnatura kontra rozszerzenie.
  let mismatch = false
  const expectedFamily = EXTENSION_FAMILY[declaredExtension]
  if (
    detectedType !== null &&
    expectedFamily !== undefined &&
    !expectedFamily.includes(detectedType)
  ) {
    mismatch = true
    const isExecutable = detectedType === "pe" || detectedType === "elf"
    if (isExecutable && DOC_IMAGE_EXTS.has(declaredExtension)) {
      signals.push({
        id: "magic-exe-masquerade",
        weight: 75,
        reason: `Plik ma rozszerzenie .${declaredExtension}, ale w środku jest program wykonywalny (PE/MZ).`
      })
    } else {
      signals.push({
        id: "magic-type-mismatch",
        weight: 40,
        reason: `Sygnatura wskazuje typ "${detectedType}", ale rozszerzenie .${declaredExtension} sugeruje inny format.`
      })
    }
  }

  // 4) polyglot — ważna druga sygnatura osadzona w bajtach.
  let polyglot = false
  if (detectedType === "zip" || detectedType === "pe" || detectedType === "pdf") {
    const latin1 = toLatin1(bytes)
    const PDF = "%PDF"
    const ZIP = "PK\x03\x04"
    if (detectedType === "zip" && containsAfterStart(latin1, PDF)) {
      polyglot = true
    } else if (
      detectedType === "pe" &&
      (containsAfterStart(latin1, PDF) || containsAfterStart(latin1, ZIP))
    ) {
      polyglot = true
    } else if (detectedType === "pdf" && containsAfterStart(latin1, ZIP)) {
      polyglot = true
    }
    if (polyglot) {
      signals.push({
        id: "magic-polyglot",
        weight: 55,
        reason:
          "Plik jest polyglotem — ważna sygnatura dwóch różnych formatów naraz."
      })
    }
  }

  // 5) sortuj sygnały malejąco po wadze.
  signals.sort((a, b) => b.weight - a.weight)

  return { signals, detectedType, declaredExtension, mismatch, polyglot }
}
