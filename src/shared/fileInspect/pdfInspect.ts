// src/shared/fileInspect/pdfInspect.ts
// Stage-1 strukturalna inspekcja PDF. Operuje na surowych bajtach: czysta,
// deterministyczna, bez sieci i DOM. To NIE antywirus — wykrywamy niebezpieczną
// STRUKTURĘ (auto-uruchamianie, JS, /Launch, osadzone pliki), nie sygnatury.

import type { FileSignal, PdfInspectResult } from "./types"

/** Limit skanowania zdekodowanego stringa (bezpieczeństwo pamięci/CPU). */
const SCAN_LIMIT = 2_000_000

/** Ile pierwszych bajtów przeszukujemy w poszukiwaniu nagłówka %PDF-. */
const HEADER_WINDOW = 1024

export function inspectPdf(bytes: Uint8Array): PdfInspectResult {
  // latin1 jest 1:1 bajt→codepoint, więc zachowuje surowe bajty do skanu tokenów.
  const decoded = new TextDecoder("latin1").decode(bytes)
  const scan = decoded.length > SCAN_LIMIT ? decoded.slice(0, SCAN_LIMIT) : decoded

  // Nagłówek %PDF- w pierwszych ~1KB.
  const header = scan.length > HEADER_WINDOW ? scan.slice(0, HEADER_WINDOW) : scan
  const isPdf = header.includes("%PDF-")

  if (!isPdf) {
    return {
      isPdf: false,
      signals: [],
      hasOpenAction: false,
      hasJavaScript: false,
      hasLaunch: false,
      hasEmbeddedFile: false,
      hasUriActions: false,
      hasAcroForm: false,
      encrypted: false
    }
  }

  const has = (token: string): boolean => scan.includes(token)

  const hasLaunch = has("/Launch")
  const hasJavaScript = has("/JavaScript") || has("/JS")
  const hasOpenAction = has("/OpenAction") || has("/AA")
  const hasEmbeddedFile = has("/EmbeddedFile")
  const hasAcroForm = has("/AcroForm")
  const hasUriActions = has("/URI")
  const encrypted = has("/Encrypt")

  const signals: FileSignal[] = []

  if (hasLaunch) {
    signals.push({
      id: "pdf-launch",
      weight: 75,
      reason: "PDF zawiera akcję /Launch — może uruchomić zewnętrzny program."
    })
  }
  if (hasJavaScript) {
    signals.push({
      id: "pdf-javascript",
      weight: 60,
      reason: "PDF zawiera osadzony JavaScript."
    })
  }
  if (hasOpenAction) {
    signals.push({
      id: "pdf-openaction",
      weight: 45,
      reason: "PDF wykonuje akcję automatycznie przy otwarciu (/OpenAction)."
    })
  }
  if (hasEmbeddedFile) {
    signals.push({
      id: "pdf-embedded",
      weight: 40,
      reason: "PDF zawiera osadzony plik (/EmbeddedFile)."
    })
  }
  if (hasAcroForm) {
    signals.push({
      id: "pdf-acroform",
      weight: 25,
      reason: "PDF zawiera formularz (/AcroForm) — możliwy wektor wyłudzeń."
    })
  }
  if (hasUriActions) {
    signals.push({
      id: "pdf-uri",
      weight: 15,
      reason: "PDF zawiera akcje sieciowe (/URI)."
    })
  }
  if (encrypted) {
    signals.push({
      id: "pdf-encrypted",
      weight: 20,
      reason: "PDF jest zaszyfrowany — utrudnia inspekcję."
    })
  }

  signals.sort((a, b) => b.weight - a.weight)

  return {
    isPdf: true,
    signals,
    hasOpenAction,
    hasJavaScript,
    hasLaunch,
    hasEmbeddedFile,
    hasUriActions,
    hasAcroForm,
    encrypted
  }
}
