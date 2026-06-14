// src/shared/linkSafety/urlHeuristics.ts
// Link Safety Engine — czysta, lokalna analiza URL-a pod kątem phishingu/scamu.
//
// ZASADY (spójne z resztą produktu):
//  - Zero sieci, zero DOM, zero modeli. Sama heurystyka po stringu URL-a
//    (+ opcjonalny tekst kotwicy i origin strony). Dzięki temu działa
//    synchronicznie na `mouseover`, jest w pełni testowalna i deterministyczna.
//  - Każdy sygnał ma wagę i CZYTELNY powód po polsku — UI pokazuje dokładnie
//    to, na czym oparł werdykt (honest provenance, jak w featureRegistry).
//  - Wynik to ryzyko 0-100 + "szansa, że link jest bezpieczny" (odds).
//
// Heurystyki to konsensus rozpoznanych sygnałów phishingowych
// (userinfo `@`, IP-host, punycode/IDN, podszywanie się pod markę,
//  homoglify cyfrowe, podejrzane TLD, słowa-wytrychy poświadczeń, itd.).

import { clamp } from "../aiDeepDive/normalize"

export type LinkRiskLevel = "low" | "medium" | "high" | "critical"

export interface LinkSignal {
  /** Stabilny identyfikator sygnału (do testów / telemetrii). */
  id: string
  /** Wkład w wynik ryzyka (0-100, sumowany i clampowany). */
  weight: number
  /** Czytelny powód po polsku — to ląduje wprost w UI. */
  reason: string
}

export interface LinkVerdict {
  href: string
  scheme: string
  host: string
  registrableDomain: string
  /** Ryzyko 0-100 (wyżej = gorzej). */
  score: number
  /** Szansa, że link jest bezpieczny, 0-100 (= 100 - score). */
  legitimacyOdds: number
  level: LinkRiskLevel
  /** Sygnały posortowane malejąco wagą. */
  signals: LinkSignal[]
  /** Marka, pod którą link prawdopodobnie się podszywa (lub null). */
  brandImpersonated: string | null
}

export interface AnalyzeLinkOptions {
  /** Widoczny tekst kotwicy — wykrywa rozjazd "treść vs cel". */
  anchorText?: string
  /** Origin bieżącej strony — link wewnętrzny traktujemy łagodniej. */
  pageOrigin?: string
}

// Progi spójne z resztą aplikacji (score.ts).
const LEVELS = { low: 25, medium: 55, high: 80 } as const

// Złożone sufiksy publiczne — przybliżenie eTLD+1 bez listy PSL.
const MULTI_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk",
  "com.au", "net.au", "org.au",
  "co.jp", "co.kr", "co.in", "co.nz", "co.za",
  "com.br", "com.mx", "com.ar", "com.tr", "com.cn", "com.hk", "com.sg",
  "com.pl", "net.pl", "org.pl", "gov.pl", "edu.pl", "waw.pl"
])

// Marki najczęściej podrabiane (globalne + polski kontekst finansowy/logistyczny).
export const KNOWN_BRANDS = [
  "paypal", "apple", "icloud", "google", "gmail", "microsoft", "outlook",
  "amazon", "facebook", "instagram", "whatsapp", "netflix", "spotify",
  "binance", "coinbase", "metamask", "steam", "linkedin", "dropbox", "opera",
  "allegro", "olx", "vinted", "inpost", "paczkomat", "dhl", "dpd", "fedex", "ups",
  "pko", "mbank", "ing", "santander", "millennium", "pekao", "blik",
  "orlen", "gov", "epuap", "profilzaufany"
]

// Słowa-wytrychy poświadczeń/pilności w hoście lub ścieżce.
const CREDENTIAL_KEYWORDS = [
  "login", "signin", "sign-in", "verify", "verification", "account", "secure",
  "security", "update", "confirm", "webscr", "banking", "wallet", "recover",
  "recovery", "unlock", "suspend", "suspended", "validate", "authenticate",
  "auth", "session", "password", "weryfikacja", "potwierdz", "logowanie",
  "platnosc", "doplata", "doplac"
]

const DOWNLOAD_LURE_KEYWORDS = [
  "setup", "installer", "install", "download", "update", "browser", "chrome",
  "opera", "edge", "firefox", "exe", "msi", "application", "setupfile"
]

const EXECUTABLE_EXTENSIONS = [
  ".exe", ".msi", ".bat", ".cmd", ".scr", ".com", ".ps1", ".vbs", ".js", ".jar"
]

// TLD nadreprezentowane w kampaniach phishingowych / malware.
const SUSPICIOUS_TLDS = new Set([
  "zip", "mov", "xyz", "top", "tk", "ml", "ga", "cf", "gq", "click", "link",
  "country", "kim", "work", "review", "live", "icu", "rest", "cam", "monster",
  "fit", "loan", "men", "date", "stream", "download", "racing", "win", "bid",
  "support", "online", "site", "club", "cyou", "sbs", "lol", "quest"
])

// Znane skracarki — cel jest nieprzejrzysty do momentu kliknięcia.
const URL_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "cutt.ly", "rebrand.ly", "shorturl.at", "rb.gy", "t.ly", "shor.by", "tiny.cc"
])

// Mapowanie homoglifów cyfrowych do liter (paypa1 -> paypal, g00gle -> google).
const HOMOGLYPH_MAP: Record<string, string> = {
  "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g"
}

export function deglyph(value: string): string {
  return value.replace(/[013457890]/g, (d) => HOMOGLYPH_MAP[d] ?? d)
}

function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true // IPv4
  if (host.startsWith("[") && host.includes(":")) return true // IPv6 literal
  return false
}

export function registrableDomain(host: string): string {
  const labels = host.replace(/\.$/, "").split(".")
  if (labels.length <= 2) return labels.join(".")
  const lastTwo = labels.slice(-2).join(".")
  const lastThree = labels.slice(-3).join(".")
  if (MULTI_SUFFIXES.has(lastTwo)) return lastThree
  return lastTwo
}

/** Główna etykieta domeny rejestrowalnej (np. "paypal" z "paypal.com"). */
function mainLabel(registrable: string): string {
  return registrable.split(".")[0] ?? registrable
}

function levelForScore(score: number): LinkRiskLevel {
  if (score >= LEVELS.high) return "critical"
  if (score >= LEVELS.medium) return "high"
  if (score >= LEVELS.low) return "medium"
  return "low"
}

/**
 * Analizuje pojedynczy link. Zwraca `null` dla rzeczy, których świadomie nie
 * oceniamy (puste, kotwice `#`, `mailto:`/`tel:`) — wtedy UI nic nie pokazuje.
 */
export function analyzeLink(
  rawHref: string,
  opts: AnalyzeLinkOptions = {}
): LinkVerdict | null {
  const href = (rawHref ?? "").trim()
  if (!href || href.startsWith("#")) return null

  const lower = href.toLowerCase()
  if (lower.startsWith("mailto:") || lower.startsWith("tel:")) return null

  // Schematy aktywne — oceniamy je jako wysokie ryzyko same w sobie.
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    const scheme = lower.split(":")[0]
    const signals: LinkSignal[] = [
      {
        id: "active-scheme",
        weight: 85,
        reason: `Link uruchamia kod/payload (${scheme}:), nie prowadzi do zwykłej strony.`
      }
    ]
    return finalize(href, scheme, "", "", signals, null)
  }

  let url: URL
  try {
    url = new URL(href, opts.pageOrigin)
  } catch {
    return null
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null

  const host = url.hostname.toLowerCase()
  const registrable = registrableDomain(host)
  const path = (url.pathname + url.search).toLowerCase()
  const signals: LinkSignal[] = []
  let brandImpersonated: string | null = null

  // 1) userinfo w URL (wszystko przed `@` jest ignorowane przez przeglądarkę).
  if (url.username || url.password || /^[^/]*@/.test(href.replace(/^https?:\/\//i, ""))) {
    signals.push({
      id: "userinfo-at",
      weight: 70,
      reason: "URL zawiera '@' — prawdziwy adres to część PO znaku '@', łatwo o podszycie."
    })
  }

  // 2) Host to surowy adres IP.
  if (isIpLiteral(host)) {
    signals.push({
      id: "ip-host",
      weight: 55,
      reason: "Host to surowy adres IP zamiast nazwy domeny — typowe dla scamu."
    })
  }

  // 3) Punycode / IDN — ryzyko homografu (xn--).
  if (host.includes("xn--")) {
    signals.push({
      id: "punycode-idn",
      weight: 50,
      reason: "Domena IDN (punycode) — znaki mogą udawać litery łacińskie (homograf)."
    })
  }

  // 4) Podszywanie się pod markę + homoglify.
  const brandHit = detectBrandImpersonation(host, registrable, path)
  if (brandHit) {
    brandImpersonated = brandHit.brand
    signals.push(brandHit.signal)
  }

  // 5) Podejrzany TLD.
  const tld = registrable.split(".").pop() ?? ""
  if (SUSPICIOUS_TLDS.has(tld)) {
    signals.push({
      id: "suspicious-tld",
      weight: 28,
      reason: `Rozszerzenie .${tld} jest nadreprezentowane w kampaniach phishingowych.`
    })
  }

  // 6) Skracarka — nieprzejrzysty cel.
  if (URL_SHORTENERS.has(registrable) || URL_SHORTENERS.has(host)) {
    signals.push({
      id: "url-shortener",
      weight: 30,
      reason: "Skrócony link — realny cel jest ukryty aż do kliknięcia."
    })
  }

  // 6b) Fake installer / executable download lure. This is the "OperaSetup
  // from a random .xyz" class: the URL itself often carries setup/install
  // campaign terms before the browser shows an application save dialog.
  const executableExt = EXECUTABLE_EXTENSIONS.find(
    (ext) => path.endsWith(ext) || path.includes(`${ext}?`) || path.includes(`${ext}&`)
  )
  if (executableExt) {
    signals.push({
      id: "executable-download",
      weight: 68,
      reason: `Link wygląda na pobranie pliku wykonywalnego (${executableExt}).`
    })
  }
  const downloadWord = DOWNLOAD_LURE_KEYWORDS.find((kw) => path.includes(kw))
  if (downloadWord && (SUSPICIOUS_TLDS.has(tld) || executableExt || brandHit)) {
    signals.push({
      id: "download-lure",
      weight: 45,
      reason: `Adres wygląda jak wabik na instalator/pobranie (słowo: "${downloadWord}").`
    })
  }

  // 7) Rozjazd: tekst kotwicy pokazuje inną domenę niż cel.
  const mismatch = detectAnchorMismatch(opts.anchorText, registrable)
  if (mismatch) signals.push(mismatch)

  // 8) Słowa-wytrychy poświadczeń w hoście/ścieżce.
  const credWord = CREDENTIAL_KEYWORDS.find(
    (kw) => host.includes(kw) || path.includes(kw)
  )
  if (credWord) {
    signals.push({
      id: "credential-keyword",
      weight: 18,
      reason: `Adres sugeruje wyłudzenie poświadczeń (słowo: "${credWord}").`
    })
  }

  // 9) Struktura hosta: głębokie subdomeny, długość, myślniki, cyfry.
  const labels = host.split(".")
  if (labels.length >= 5) {
    signals.push({
      id: "deep-subdomains",
      weight: 22,
      reason: `Bardzo głęboka domena (${labels.length} poziomów) — częsty kamuflaż celu.`
    })
  }
  if (host.length > 30) {
    signals.push({
      id: "long-host",
      weight: 12,
      reason: "Nietypowo długa nazwa hosta."
    })
  }
  const hyphenCount = (registrable.match(/-/g) ?? []).length
  if (hyphenCount >= 3) {
    signals.push({
      id: "many-hyphens",
      weight: 14,
      reason: `Dużo myślników w domenie (${hyphenCount}) — typowe dla generowanych domen scamu.`
    })
  }
  if (/\d{4,}/.test(mainLabel(registrable))) {
    signals.push({
      id: "digit-heavy-domain",
      weight: 12,
      reason: "Domena naszpikowana cyframi — częste w domenach jednorazowych."
    })
  }

  // 10) http bez TLS przy linku "logowaniowym".
  if (url.protocol === "http:" && (credWord || brandHit)) {
    signals.push({
      id: "insecure-credential-link",
      weight: 25,
      reason: "Brak HTTPS na linku wyglądającym na logowanie/płatność."
    })
  }

  // 11) Nietypowy port.
  if (url.port && url.port !== "80" && url.port !== "443") {
    signals.push({
      id: "nonstandard-port",
      weight: 16,
      reason: `Niestandardowy port (${url.port}).`
    })
  }

  return finalize(href, url.protocol.replace(":", ""), host, registrable, signals, brandImpersonated)
}

function detectBrandImpersonation(
  host: string,
  registrable: string,
  path: string
): { brand: string; signal: LinkSignal } | null {
  const main = mainLabel(registrable)
  const mainDeglyphed = deglyph(main)
  const hostDeglyphed = deglyph(host)

  for (const brand of KNOWN_BRANDS) {
    // Domena należy do marki (np. paypal.com, accounts.google.com) — czysto.
    if (main === brand) return null
  }

  for (const brand of KNOWN_BRANDS) {
    const inMain = main.includes(brand)
    const inMainGlyph = mainDeglyphed.includes(brand) && !main.includes(brand)
    const inHostElsewhere =
      hostDeglyphed.includes(brand) && !main.includes(brand) && !mainDeglyphed.includes(brand)
    const inPath = path.includes(brand)

    if (inMainGlyph) {
      return {
        brand,
        signal: {
          id: "brand-homoglyph",
          weight: 72,
          reason: `Domena udaje "${brand}" podmianą znaków na cyfry (np. 0→o, 1→l).`
        }
      }
    }
    if (inMain) {
      // brand jako część innej domeny rejestrowalnej: "paypal-login.com"
      return {
        brand,
        signal: {
          id: "brand-in-domain",
          weight: 60,
          reason: `Nazwa "${brand}" wmontowana w obcą domenę (${registrable}), to nie jest oficjalna domena.`
        }
      }
    }
    if (inHostElsewhere) {
      // brand w subdomenie, ale rejestrowalna domena jest inna: "google.com.evil.ru"
      return {
        brand,
        signal: {
          id: "brand-in-subdomain",
          weight: 58,
          reason: `"${brand}" jest tylko w subdomenie — prawdziwa domena to ${registrable}.`
        }
      }
    }
    if (inPath) {
      return {
        brand,
        signal: {
          id: "brand-in-path",
          weight: 24,
          reason: `Marka "${brand}" w ścieżce, ale domena (${registrable}) do niej nie należy.`
        }
      }
    }
  }
  return null
}

function detectAnchorMismatch(
  anchorText: string | undefined,
  registrable: string
): LinkSignal | null {
  if (!anchorText) return null
  const text = anchorText.trim().toLowerCase()
  // Tekst kotwicy wygląda jak domena: "www.paypal.com", "paypal.com/..."
  const m = text.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/)
  if (!m) return null
  const textRegistrable = registrableDomain(m[1].replace(/^www\./, ""))
  if (!textRegistrable.includes(".")) return null
  if (textRegistrable !== registrable) {
    return {
      id: "anchor-href-mismatch",
      weight: 65,
      reason: `Tekst pokazuje "${textRegistrable}", ale link prowadzi do ${registrable}.`
    }
  }
  return null
}

function finalize(
  href: string,
  scheme: string,
  host: string,
  registrable: string,
  signals: LinkSignal[],
  brandImpersonated: string | null
): LinkVerdict {
  const sorted = [...signals].sort((a, b) => b.weight - a.weight)
  const score = clamp(Math.round(sorted.reduce((sum, s) => sum + s.weight, 0)), 0, 100)
  return {
    href,
    scheme,
    host,
    registrableDomain: registrable,
    score,
    legitimacyOdds: 100 - score,
    level: levelForScore(score),
    signals: sorted,
    brandImpersonated
  }
}
