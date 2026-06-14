// src/shared/mailGuard/types.ts
// KONTRAKT MailGuarda — wspólne typy dla wszystkich czystych modułów logiki.
// Każdy moduł (sender, attachment, MO, fingerprint) implementuje funkcję wg
// tych interfejsów. Zero I/O, zero DOM, zero sieci — sama logika po danych już
// wyłuskanych z wyrenderowanego DOM webmaila (isolated world, read-only).
//
// Reużywaj istniejącego silnika: registrableDomain/deglyph/KNOWN_BRANDS z
// ../linkSafety/urlHeuristics oraz clamp z ../aiDeepDive/normalize.

export type MailRiskLevel = "low" | "medium" | "high" | "critical"

/** Pojedynczy sygnał ryzyka z czytelnym powodem po polsku (ląduje wprost w UI). */
export interface MailSignal {
  id: string
  /** Wkład w wynik 0-100 (sumowany i clampowany na poziomie integracji). */
  weight: number
  reason: string
}

// ---------------------------------------------------------------------------
// 1) Analiza nadawcy  —  src/shared/mailGuard/senderHeuristics.ts
// ---------------------------------------------------------------------------

export type AuthResult = "pass" | "fail" | "softfail" | "neutral" | "none" | "unknown"

export interface SenderInput {
  /** Nazwa wyświetlana, np. "PayPal Obsługa". */
  displayName: string
  /** Pełny adres e-mail nadawcy, np. "noreply@paypa1-secure.tk". */
  address: string
  /** Adres Reply-To, jeśli różny / obecny. */
  replyTo?: string
  /** Wyniki uwierzytelnienia sparsowane z UI webmaila (gdy dostępne). */
  auth?: { spf?: AuthResult; dkim?: AuthResult; dmarc?: AuthResult }
}

export interface SenderVerdict {
  signals: MailSignal[]
  /** Marka, pod którą nadawca się podszywa (lub null). */
  lookalikeBrand: string | null
  /** Display-name twierdzi, że to marka X, a adres jest z obcej domeny. */
  displayNameSpoof: boolean
  /** Reply-To prowadzi do innej domeny rejestrowalnej niż From. */
  replyToMismatch: boolean
  /** Domena rejestrowalna nadawcy (np. "paypa1-secure.tk"). */
  senderDomain: string
}

// ---------------------------------------------------------------------------
// 2) Metadane załącznika (Stage 0)  —  src/shared/mailGuard/attachmentMetadataRisk.ts
// ---------------------------------------------------------------------------

export type AttachmentArchetype =
  | "macro"            // docm/xlsm/pptm — makra
  | "double-extension" // faktura.pdf.exe
  | "smuggling"        // html/iso/img/lnk
  | "executable"       // exe/scr/bat/cmd/js/vbs/ps1
  | "archive"          // zip/rar/7z (+ "hasło w treści")
  | "none"

export interface AttachmentInput {
  /** Pełna nazwa pliku z chipa załącznika, np. "Faktura.pdf.exe". */
  filename: string
  /** MIME z UI, jeśli dostępne. */
  mime?: string
  /** Rozmiar w bajtach, jeśli dostępny. */
  sizeBytes?: number
}

export interface AttachmentVerdict {
  signals: MailSignal[]
  archetype: AttachmentArchetype
  /** Efektywne (ostatnie realne) rozszerzenie po normalizacji, np. "exe". */
  effectiveExtension: string
}

// ---------------------------------------------------------------------------
// 3) Klasyfikator Modus Operandi  —  src/shared/mailGuard/moClassifier.ts
// ---------------------------------------------------------------------------

export type MoArchetype =
  | "bec"                 // Business Email Compromise / oszustwo na przelew
  | "malware-delivery"    // dostawa malware przez załącznik
  | "credential-phishing" // wyłudzenie poświadczeń przez link
  | "callback-scam"       // TOAD: "zadzwoń pod numer"
  | "unknown"

export interface MoInput {
  senderVerdict: SenderVerdict
  attachmentVerdicts: AttachmentVerdict[]
  /** Widoczny tekst treści maila (już znormalizowany do analizy). */
  bodyText: string
  /** Domeny rejestrowalne linków znalezionych w treści. */
  linkDomains: string[]
}

export interface MoVerdict {
  archetype: MoArchetype
  /** Pewność 0-1. */
  confidence: number
  /** Konkretne "tells" po polsku — dlaczego ten archetyp. */
  tells: string[]
}

// ---------------------------------------------------------------------------
// 4) Campaign fingerprint  —  src/shared/mailGuard/campaignFingerprint.ts
// ---------------------------------------------------------------------------

export interface FingerprintInput {
  /** Wzorzec domeny nadawcy (np. "*-secure.tk" lub sama domena). */
  senderDomainPattern: string
  /** Cel-marka, jeśli wykryto podszycie (lub null). */
  targetBrand: string | null
  /** Wzorzec domeny linku (lub null). */
  linkDomainPattern: string | null
  /** Archetyp załącznika (string z AttachmentArchetype). */
  attachmentArchetype: string
  /** Archetyp MO. */
  moArchetype: MoArchetype
}
