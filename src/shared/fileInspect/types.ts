// src/shared/fileInspect/types.ts
// KONTRAKT Stage-1 File Inspection. Inspektory są CZYSTE: na wejściu bajty
// (Uint8Array) już pobranego pliku, na wyjściu sygnały + fakty strukturalne.
// Zero sieci, zero DOM. To NIE antywirus — wykrywamy niebezpieczną STRUKTURĘ /
// zachowanie (auto-uruchamianie, makra, niezgodność typu), nie sygnatury rodzin.
//
// Bajty pochodzą z LOKALNEGO źródła (FileReader z drop/file-input), nigdy z
// dodatkowego fetcha — zero-network pozostaje nienaruszone.

export type FileRiskLevel = "low" | "medium" | "high" | "critical"

/** Pojedynczy sygnał z czytelnym powodem po polsku (ląduje wprost w UI). */
export interface FileSignal {
  id: string
  /** Wkład w wynik 0-100 (sumowany i clampowany na poziomie agregatora). */
  weight: number
  reason: string
}

// ---------------------------------------------------------------------------
// 1) PDF  —  src/shared/fileInspect/pdfInspect.ts
//    export function inspectPdf(bytes: Uint8Array): PdfInspectResult
// ---------------------------------------------------------------------------

export interface PdfInspectResult {
  /** Czy bajty wyglądają na PDF (nagłówek %PDF- w pierwszych ~1KB). */
  isPdf: boolean
  signals: FileSignal[]
  hasOpenAction: boolean   // /OpenAction lub /AA — akcja przy otwarciu
  hasJavaScript: boolean   // /JavaScript lub /JS
  hasLaunch: boolean       // /Launch — uruchomienie zewnętrznego programu
  hasEmbeddedFile: boolean // /EmbeddedFile — plik w pliku
  hasUriActions: boolean   // /URI — akcje sieciowe
  hasAcroForm: boolean     // /AcroForm — formularz (wektor wyłudzeń)
  encrypted: boolean       // /Encrypt
}

// ---------------------------------------------------------------------------
// 2) Kontener Office/ZIP/OLE  —  src/shared/fileInspect/containerInspect.ts
//    export function inspectContainer(bytes: Uint8Array): ContainerInspectResult
// ---------------------------------------------------------------------------

export type ContainerKind = "ooxml-zip" | "ole-compound" | "zip" | "none"

export interface ContainerInspectResult {
  signals: FileSignal[]
  kind: ContainerKind
  /** Makra: vbaProject.bin (OOXML) lub strumienie makr (OLE legacy). */
  hasMacros: boolean
  /** Nazwy wpisów/strumieni będących dowodem (np. "word/vbaProject.bin"). */
  macroEvidence: string[]
  /** Wpisy archiwum zaszyfrowane (general-purpose bit flag). */
  hasEncryptedEntries: boolean
  /** Zagnieżdżone wykonywalne w archiwum (np. .exe/.scr/.js w zip). */
  nestedExecutables: string[]
  /** Podejrzenie zip-bomby (ekstremalny ratio dekompresji w nagłówkach). */
  zipBombSuspected: boolean
}

// ---------------------------------------------------------------------------
// 3) Magic-byte + polyglot  —  src/shared/fileInspect/magicBytes.ts
//    export function inspectMagic(bytes: Uint8Array, filename: string): MagicResult
// ---------------------------------------------------------------------------

export interface MagicResult {
  signals: FileSignal[]
  /** Typ wykryty po sygnaturze bajtów, np. "pdf"|"zip"|"pe"|"ole"|"png"|null. */
  detectedType: string | null
  /** Rozszerzenie z nazwy pliku (lowercase, bez kropki). */
  declaredExtension: string
  /** Sygnatura nie pasuje do rozszerzenia (np. .pdf, a w środku PE/MZ). */
  mismatch: boolean
  /** Polyglot: ważna sygnatura jednego typu + drugiego (np. ZIP+PDF, MZ+...). */
  polyglot: boolean
}
