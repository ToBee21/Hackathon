// src/shared/fileInspect/containerInspect.ts
// STAGE-1 strukturalna inspekcja kontenerów ZIP / OOXML / OLE.
// Czysta, deterministyczna, bajtowa. NIE antywirus — wykrywamy niebezpieczną
// STRUKTURĘ (makra, zaszyfrowane wpisy, zagnieżdżone wykonywalne, zip-bomba).
// Zero sieci, zero DOM. Powody po polsku — lądują wprost w UI.

import type {
  ContainerInspectResult,
  ContainerKind,
  FileSignal
} from "./types"

// Sygnatury (little-endian na dysku, czytane bajt po bajcie).
const LOCAL_FILE_HEADER = [0x50, 0x4b, 0x03, 0x04] // PK\x03\x04
const EMPTY_EOCD = [0x50, 0x4b, 0x05, 0x06] // PK\x05\x06 (pusty archiwum)
const CENTRAL_DIR_HEADER = [0x50, 0x4b, 0x01, 0x02] // PK\x01\x02
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

const MAX_ENTRIES = 5000

// Rozszerzenia uznawane za wykonywalne / auto-uruchamialne.
const EXECUTABLE_EXTENSIONS = new Set([
  "exe", "scr", "bat", "cmd", "com", "pif",
  "js", "jse", "vbs", "vbe", "ws", "wsf",
  "hta", "msi", "ps1", "lnk", "jar"
])

interface CentralDirEntry {
  filename: string
  encrypted: boolean
  compressedSize: number
  uncompressedSize: number
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) return false
  }
  return true
}

function matchesAt(bytes: Uint8Array, offset: number, sig: number[]): boolean {
  if (offset + sig.length > bytes.length) return false
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false
  }
  return true
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  // Wywoływane tylko po sprawdzeniu granic.
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  // >>> 0 utrzymuje wynik jako unsigned 32-bit.
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}

function decodeLatin1(bytes: Uint8Array, start: number, end: number): string {
  let out = ""
  const clampedEnd = Math.min(end, bytes.length)
  for (let i = start; i < clampedEnd; i++) {
    out += String.fromCharCode(bytes[i])
  }
  return out
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".")
  if (dot < 0 || dot === filename.length - 1) return ""
  return filename.slice(dot + 1).toLowerCase()
}

/** Skanuje centralny katalog ZIP, zwraca listę wpisów (bounds-checked). */
function parseCentralDirectory(bytes: Uint8Array): CentralDirEntry[] {
  const entries: CentralDirEntry[] = []
  let o = 0
  while (o + 46 <= bytes.length && entries.length < MAX_ENTRIES) {
    if (!matchesAt(bytes, o, CENTRAL_DIR_HEADER)) {
      o++
      continue
    }
    // Pola nagłówka centralnego katalogu.
    const flag = readUint16LE(bytes, o + 8)
    const compressedSize = readUint32LE(bytes, o + 20)
    const uncompressedSize = readUint32LE(bytes, o + 24)
    const fnLen = readUint16LE(bytes, o + 28)
    const extraLen = readUint16LE(bytes, o + 30)
    const commentLen = readUint16LE(bytes, o + 32)

    const fnStart = o + 46
    const fnEnd = fnStart + fnLen
    if (fnEnd > bytes.length) {
      // Nagłówek deklaruje nazwę poza buforem — przerwij, nie ufaj danym.
      break
    }
    const filename = decodeLatin1(bytes, fnStart, fnEnd)

    entries.push({
      filename,
      encrypted: (flag & 0x0001) !== 0,
      compressedSize,
      uncompressedSize
    })

    o = fnEnd + extraLen + commentLen
  }
  return entries
}

export function inspectContainer(bytes: Uint8Array): ContainerInspectResult {
  const signals: FileSignal[] = []

  const isZip =
    startsWith(bytes, LOCAL_FILE_HEADER) || startsWith(bytes, EMPTY_EOCD)
  const isOle = startsWith(bytes, OLE_MAGIC)

  // Domyślnie: nic nie wykryto.
  let kind: ContainerKind = "none"
  let hasMacros = false
  const macroEvidence: string[] = []
  let hasEncryptedEntries = false
  const nestedExecutables: string[] = []
  let zipBombSuspected = false

  if (isZip) {
    const entries = parseCentralDirectory(bytes)

    // Wykrycie OOXML po obecności [Content_Types].xml.
    const isOoxml = entries.some(
      (e) => e.filename === "[Content_Types].xml"
    )
    kind = isOoxml ? "ooxml-zip" : "zip"

    let totalCompressed = 0
    let totalUncompressed = 0

    for (const entry of entries) {
      const lowerName = entry.filename.toLowerCase()

      // Makra OOXML/ZIP: vbaProject.bin.
      if (lowerName.includes("vbaproject.bin")) {
        hasMacros = true
        macroEvidence.push(entry.filename)
      }

      // Zaszyfrowane wpisy.
      if (entry.encrypted) {
        hasEncryptedEntries = true
      }

      // Zagnieżdżone wykonywalne.
      if (EXECUTABLE_EXTENSIONS.has(getExtension(entry.filename))) {
        nestedExecutables.push(entry.filename)
      }

      totalCompressed += entry.compressedSize
      totalUncompressed += entry.uncompressedSize
    }

    // Podejrzenie zip-bomby — ekstremalny współczynnik dekompresji.
    if (
      totalCompressed > 0 &&
      totalUncompressed / totalCompressed > 100 &&
      totalUncompressed > 100_000_000
    ) {
      zipBombSuspected = true
    }

    if (hasMacros) {
      signals.push({
        id: "container-macros",
        weight: 60,
        reason:
          "Dokument zawiera makra (vbaProject.bin) — typowy wektor dostawy malware."
      })
    }
    if (hasEncryptedEntries) {
      signals.push({
        id: "container-encrypted",
        weight: 35,
        reason:
          "Archiwum zawiera zaszyfrowane wpisy — omija skanery treści."
      })
    }
    if (nestedExecutables.length > 0) {
      signals.push({
        id: "container-nested-exe",
        weight: 70,
        reason: `Archiwum zawiera wykonywalne pliki: ${nestedExecutables.join(
          ", "
        )}.`
      })
    }
    if (zipBombSuspected) {
      signals.push({
        id: "container-zipbomb",
        weight: 50,
        reason:
          "Podejrzenie zip-bomby (ekstremalny współczynnik dekompresji)."
      })
    }
  } else if (isOle) {
    kind = "ole-compound"

    // OLE legacy: szukamy markerów strumieni makr w całym pliku (latin1).
    const whole = decodeLatin1(bytes, 0, bytes.length)
    if (whole.includes("_VBA_PROJECT") || whole.includes("VBA")) {
      hasMacros = true
      macroEvidence.push("OLE VBA stream")
      signals.push({
        id: "container-macros",
        weight: 60,
        reason:
          "Dokument zawiera makra (vbaProject.bin) — typowy wektor dostawy malware."
      })
    }
  }

  // Sortuj sygnały malejąco po wadze.
  signals.sort((a, b) => b.weight - a.weight)

  return {
    signals,
    kind,
    hasMacros,
    macroEvidence,
    hasEncryptedEntries,
    nestedExecutables,
    zipBombSuspected
  }
}
