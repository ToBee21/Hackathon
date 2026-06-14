// src/content/mailGuard.ts
// MailGuard — warstwa webmail. Czyta WYŁĄCZNIE wyrenderowany DOM (isolated
// world, read-only), wyłuskuje dowód otwartego maila i oddaje go pure-agregatorowi
// (shared/mailGuard/evaluate). Zero sieci, zero dotykania JS Gmaila, zero
// modyfikacji ich węzłów — dopisujemy tylko własną kartę przez registry.
//
// Selektory kotwiczone na STABILNYCH atrybutach Gmaila (span[email], download_url),
// nie na obfuskowanych klasach. Wszystko w try/catch — brak danych => brak karty.

import { evaluateMail, type MailEvidence } from "../shared/mailGuard/evaluate"
import { recordMailVerdict } from "../shared/mailGuard/mailGuardState"
import type { AttachmentInput } from "../shared/mailGuard/types"
import { registrableDomain } from "../shared/linkSafety/urlHeuristics"

const ext = globalThis.chrome
const MAILGUARD_UPDATE_EVENT = "cnd:mailguard:update"

// Hosty webmaili, na których w ogóle się uruchamiamy.
const WEBMAIL_HOSTS = ["mail.google.com"]

let lastKey = ""
let scanTimer: ReturnType<typeof setTimeout> | null = null

export function initMailGuard(): void {
  if (window.top !== window) return
  if (!WEBMAIL_HOSTS.some((h) => location.hostname.endsWith(h))) return

  const observer = new MutationObserver(() => scheduleScan())
  observer.observe(document.documentElement, { childList: true, subtree: true })
  scheduleScan()
}

function scheduleScan(): void {
  if (scanTimer) return
  scanTimer = setTimeout(() => {
    scanTimer = null
    try {
      scanOpenEmail()
    } catch {
      // DOM Gmaila bywa zmienny — nigdy nie wywalamy strony.
    }
  }, 450)
}

function scanOpenEmail(): void {
  const evidence = extractGmailEvidence()
  if (!evidence) return

  // Dedup: nie przeliczamy w kółko tego samego otwartego maila.
  const key = `${evidence.sender.address}|${evidence.subjectKey}`
  if (!evidence.sender.address || key === lastKey) return
  lastKey = key

  const verdict = evaluateMail(evidence.evidence, Date.now())
  recordMailVerdict(verdict)
  notifyPanel()

  if (verdict.level === "high" || verdict.level === "critical") {
    logEvent(
      `MailGuard: ${verdict.archetype} od ${verdict.senderDomain}` +
        (verdict.lookalikeBrand ? ` (podszycie pod ${verdict.lookalikeBrand})` : "")
    )
  }
}

interface ExtractResult {
  evidence: MailEvidence
  subjectKey: string
  sender: { address: string }
}

// Wyłuskanie dowodu z otwartego maila Gmaila. Kotwice: span[email] (nadawca),
// [download_url] (załączniki "mime:nazwa:url"), .a3s (treść). Wszystko best-effort.
function extractGmailEvidence(): ExtractResult | null {
  const main = document.querySelector('[role="main"]') ?? document.body
  if (!main) return null

  // --- Nadawca: span[email][name] w nagłówku otwartej wiadomości ---
  const senderEl = main.querySelector<HTMLElement>("span[email]")
  const address = (senderEl?.getAttribute("email") ?? "").trim().toLowerCase()
  if (!address) return null
  const displayName =
    senderEl?.getAttribute("name")?.trim() ||
    senderEl?.textContent?.trim() ||
    ""

  // --- Temat (klucz dedup + sygnał kontekstu) ---
  const subject = main.querySelector("h2")?.textContent?.trim() ?? ""

  // --- Treść: ostatni kontener .a3s = aktualnie otwarta wiadomość ---
  const bodyEls = main.querySelectorAll<HTMLElement>(".a3s")
  const bodyEl = bodyEls.length ? bodyEls[bodyEls.length - 1] : null
  const bodyText = (bodyEl?.innerText ?? main.textContent ?? "").slice(0, 20_000)

  // --- Linki w treści -> domeny rejestrowalne ---
  const linkScope: ParentNode = bodyEl ?? main
  const linkDomains = uniq(
    Array.from(linkScope.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((a) => domainOf(a.getAttribute("href") ?? ""))
      .filter((d): d is string => Boolean(d))
  ).slice(0, 20)

  // --- Załączniki: [download_url] = "mime:nazwa:url" ---
  const attachments = extractAttachments(main)

  const evidence: MailEvidence = {
    sender: { displayName, address },
    attachments,
    bodyText,
    linkDomains
  }
  return { evidence, subjectKey: subject.slice(0, 80), sender: { address } }
}

function extractAttachments(scope: ParentNode): AttachmentInput[] {
  const out: AttachmentInput[] = []
  const seen = new Set<string>()
  for (const el of Array.from(scope.querySelectorAll<HTMLElement>("[download_url]"))) {
    const raw = el.getAttribute("download_url") ?? ""
    // format: "<mime>:<filename>:<url...>" — mime i filename to dwa pierwsze segmenty
    const firstColon = raw.indexOf(":")
    if (firstColon < 0) continue
    const mime = raw.slice(0, firstColon)
    const rest = raw.slice(firstColon + 1)
    const secondColon = rest.indexOf(":")
    const filename = (secondColon < 0 ? rest : rest.slice(0, secondColon)).trim()
    if (!filename || seen.has(filename)) continue
    seen.add(filename)
    out.push({ filename, mime: mime || undefined })
    if (out.length >= 12) break
  }
  return out
}

function domainOf(href: string): string | null {
  try {
    const url = new URL(href, location.origin)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    const host = url.hostname.toLowerCase()
    // Pomijamy linki wewnątrz samego Gmaila (UI), interesuje nas treść.
    if (host.endsWith("mail.google.com") || host.endsWith("google.com")) return null
    return registrableDomain(host)
  } catch {
    return null
  }
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items))
}

function notifyPanel(): void {
  try {
    window.dispatchEvent(new CustomEvent(MAILGUARD_UPDATE_EVENT))
  } catch {
    /* ignore */
  }
}

function logEvent(message: string): void {
  try {
    ext?.runtime?.sendMessage?.({
      type: "LOG_EVENT",
      entry: { timestamp: Date.now(), source: "mailGuard", message, count: 1 }
    })
  } catch {
    /* SW może spać; best-effort */
  }
}
