// src/content/pageContext.ts
// Builds the normalized PageContext for the current page. Reuses the proven
// visible-text extraction from the AI Deep-Dive scanner and layers on OG data,
// forms/password detection, consent-banner detection, current selection, and the
// sensitive-page guard. NEVER reads form input values or password content.

import { extractVisibleTextFromPage } from "./aiDeepDive/extractVisibleText"
import { evaluatePageGuard } from "./sensitivePageGuard"
import {
  emptyPageContext,
  type PageContext,
  type PageOpenGraph
} from "../shared/pageContextSchema"

const CONSENT_HINTS = [
  "cookie",
  "consent",
  "gdpr",
  "rodo",
  "zgod",
  "accept all",
  "akceptuj"
]

export function buildPageContext(): PageContext {
  if (typeof document === "undefined") return emptyPageContext()

  const guard = evaluatePageGuard()
  const base = extractVisibleTextFromPage()

  return {
    url: location.href,
    origin: location.origin,
    title: base.title,
    meta: base.meta,
    og: readOpenGraph(),
    headings: base.headings ? base.headings.split("\n").filter(Boolean) : [],
    // When excluded, we keep zero visible text so features can't reason over it.
    visibleText: guard.excluded ? "" : base.body,
    selectedText: readSelection(),
    hasForms: document.querySelector("form") !== null,
    hasPasswordField: guard.hasPasswordField,
    hasConsentBanner: detectConsentBanner(),
    excluded: guard.excluded,
    excludedReason: guard.reason,
    capturedAt: Date.now()
  }
}

function readOpenGraph(): PageOpenGraph {
  const get = (property: string): string | undefined => {
    const el = document.querySelector<HTMLMetaElement>(
      `meta[property="${property}"]`
    )
    const value = el?.content?.trim()
    return value || undefined
  }
  return {
    title: get("og:title"),
    description: get("og:description"),
    type: get("og:type"),
    siteName: get("og:site_name")
  }
}

function readSelection(): string {
  try {
    const text = window.getSelection?.()?.toString().trim() ?? ""
    return text.slice(0, 2000)
  } catch {
    return ""
  }
}

function detectConsentBanner(): boolean {
  // Cheap heuristic: a fixed/sticky element whose text mentions consent terms.
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[aria-label*="cookie" i]'
    )
  ).slice(0, 12)

  for (const el of candidates) {
    const text = (el.textContent || "").toLowerCase()
    if (CONSENT_HINTS.some((hint) => text.includes(hint))) return true
  }
  return false
}
