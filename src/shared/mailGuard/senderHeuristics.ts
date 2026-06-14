// src/shared/mailGuard/senderHeuristics.ts
// MailGuard — analiza nadawcy. Czysta, lokalna, deterministyczna heurystyka po
// danych wyłuskanych z UI webmaila. Zero sieci, zero DOM. Reużywa silnika
// rozpoznawania marek/domen z linkSafety (registrableDomain/deglyph/KNOWN_BRANDS).
//
// Każdy sygnał ma wagę i CZYTELNY powód po polsku — UI pokazuje wprost, na czym
// oparł werdykt (honest provenance).

import {
  registrableDomain,
  deglyph,
  KNOWN_BRANDS
} from "../linkSafety/urlHeuristics"

import type {
  SenderInput,
  SenderVerdict,
  MailSignal
} from "./types"

// Darmowe skrzynki — legalna marka nigdy nie wysyła oficjalnej korespondencji
// z takiej domeny, więc "marka w display-name + freemail" to czerwona flaga.
const FREEMAIL_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "wp.pl",
  "o2.pl",
  "interia.pl",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "proton.me"
])

/** Główna etykieta domeny rejestrowalnej (np. "paypal" z "paypal.com"). */
function mainLabel(registrable: string): string {
  return registrable.split(".")[0] ?? registrable
}

/** Wyłuskuje domenę spod adresu e-mail: część po "@", lowercase, rejestrowalna. */
function senderRegistrable(address: string): string {
  const at = address.lastIndexOf("@")
  const host = (at >= 0 ? address.slice(at + 1) : address).trim().toLowerCase()
  if (!host) return ""
  return registrableDomain(host)
}

/**
 * Wykrywa markę, pod którą podszywa się DOMENA nadawcy (homoglif lub wmontowanie
 * w obcą domenę rejestrowalną). Zwraca null, jeśli domena jest oficjalną domeną
 * marki (główna etykieta === marka) albo brak dopasowania.
 */
function detectSenderDomainBrand(
  registrable: string
): { brand: string; signal: MailSignal } | null {
  const main = mainLabel(registrable)
  const mainDeglyphed = deglyph(main)
  const registrableDeglyphed = deglyph(registrable)

  // Domena należy do marki (np. paypal.com, allegro.pl) — czysto, nie flagujemy.
  for (const brand of KNOWN_BRANDS) {
    if (main === brand) return null
  }

  for (const brand of KNOWN_BRANDS) {
    const inMain = main.includes(brand)
    const inMainGlyph = mainDeglyphed.includes(brand) && !main.includes(brand)
    const inRegistrableElsewhere =
      registrableDeglyphed.includes(brand) &&
      !main.includes(brand) &&
      !mainDeglyphed.includes(brand)

    if (inMainGlyph) {
      return {
        brand,
        signal: {
          id: "sender-brand-homoglyph",
          weight: 55,
          reason: `Domena nadawcy udaje "${brand}" podmianą znaków na cyfry (np. 0→o, 1→l): ${registrable}.`
        }
      }
    }
    if (inMain) {
      return {
        brand,
        signal: {
          id: "sender-brand-in-domain",
          weight: 55,
          reason: `Nazwa "${brand}" wmontowana w obcą domenę nadawcy (${registrable}) — to nie jest oficjalna domena marki.`
        }
      }
    }
    if (inRegistrableElsewhere) {
      return {
        brand,
        signal: {
          id: "sender-brand-in-domain",
          weight: 55,
          reason: `Nazwa "${brand}" wmontowana w obcą domenę nadawcy (${registrable}) — to nie jest oficjalna domena marki.`
        }
      }
    }
  }
  return null
}

/** Wykrywa markę z KNOWN_BRANDS wymienioną w nazwie wyświetlanej nadawcy. */
function brandInDisplayName(displayName: string): string | null {
  const normalized = deglyph((displayName ?? "").toLowerCase())
  for (const brand of KNOWN_BRANDS) {
    if (normalized.includes(brand)) return brand
  }
  return null
}

export function analyzeSender(input: SenderInput): SenderVerdict {
  const signals: MailSignal[] = []
  let lookalikeBrand: string | null = null
  let displayNameSpoof = false
  let replyToMismatch = false

  const senderDomain = senderRegistrable(input.address)
  const senderMain = mainLabel(senderDomain)
  const displayBrand = brandInDisplayName(input.displayName)

  // 1) DISPLAY-NAME SPOOF: display-name twierdzi, że to marka X, a adres jest z
  //    obcej domeny rejestrowalnej (główna etykieta !== marka).
  if (displayBrand && senderMain !== displayBrand) {
    displayNameSpoof = true
    lookalikeBrand = displayBrand
    signals.push({
      id: "display-name-spoof",
      weight: 60,
      reason: `Nazwa nadawcy podszywa się pod "${displayBrand}", a adres jest z domeny obcej (${senderDomain}).`
    })
  }

  // 2) LOOKALIKE DOMENA NADAWCY: homoglif lub marka wmontowana w obcą domenę.
  //    Nie flagujemy oficjalnej domeny marki.
  const domainBrandHit = detectSenderDomainBrand(senderDomain)
  if (domainBrandHit) {
    if (!lookalikeBrand) lookalikeBrand = domainBrandHit.brand
    signals.push(domainBrandHit.signal)
  }

  // 3) REPLY-TO MISMATCH: Reply-To prowadzi do innej domeny rejestrowalnej.
  if (input.replyTo && input.replyTo.trim()) {
    const replyDomain = senderRegistrable(input.replyTo)
    if (replyDomain && replyDomain !== senderDomain) {
      replyToMismatch = true
      signals.push({
        id: "reply-to-mismatch",
        weight: 45,
        reason: `Reply-To kieruje do innej domeny (${replyDomain}) niż adres nadawcy (${senderDomain}).`
      })
    }
  }

  // 4) FREEMAIL JAKO MARKA: oficjalna marka nie pisze z darmowej skrzynki.
  if (displayBrand && FREEMAIL_DOMAINS.has(senderDomain)) {
    signals.push({
      id: "freemail-as-brand",
      weight: 35,
      reason: `Nazwa nadawcy podszywa się pod "${displayBrand}", ale adres jest z darmowej skrzynki (${senderDomain}).`
    })
  }

  // 5) AUTH: tylko twarde "fail"/"softfail" liczymy. "unknown"/"none"/brak → cisza.
  if (input.auth) {
    const { spf, dkim, dmarc } = input.auth
    if (dkim === "fail" || dmarc === "fail") {
      signals.push({
        id: "auth-dmarc-dkim-fail",
        weight: 40,
        reason: "DMARC/DKIM: niepowodzenie weryfikacji — nadawca może być sfałszowany."
      })
    }
    if (spf === "fail" || spf === "softfail") {
      signals.push({
        id: "auth-spf-fail",
        weight: 25,
        reason: "SPF: serwer wysyłający nie jest autoryzowany dla tej domeny."
      })
    }
  }

  signals.sort((a, b) => b.weight - a.weight)

  return {
    signals,
    lookalikeBrand,
    displayNameSpoof,
    replyToMismatch,
    senderDomain
  }
}
