// src/content/sensitivePageGuard.ts
// Decides whether the current page must NOT be scanned by default. Local-first,
// privacy-first: banking, government, medical portals, webmail, and authenticated
// dashboards are excluded unless the user explicitly opts in. Password fields
// also limit scanning. This is a heuristic guard, not a guarantee — it errs on
// the side of NOT scanning.

const SENSITIVE_HOST_PATTERNS: RegExp[] = [
  // Banking / finance
  /(^|\.)(bank|banking|paypal|revolut|wise|ing|mbank|santander|pko|paypal)\./i,
  /\b(bank|banking)\b/i,
  // Government
  /(^|\.)gov(\.|$)/i,
  /\.gov\./i,
  /gov\.pl$/i,
  /\b(login\.gov|id\.gov)\b/i,
  // Webmail
  /(^|\.)(mail|outlook|gmail|proton|yahoo)\./i,
  /mail\.google\.com$/i,
  // Health portals
  /(^|\.)(patient|health|nhs|mojeibm|pacjent)\./i
]

const SENSITIVE_PATH_HINTS = [
  "/login",
  "/signin",
  "/account",
  "/wallet",
  "/checkout",
  "/payment",
  "/inbox",
  "/settings/security"
]

export interface GuardVerdict {
  excluded: boolean
  reason?: string
  hasPasswordField: boolean
}

export function evaluatePageGuard(
  doc: Document = document,
  loc: Location = location
): GuardVerdict {
  const hasPasswordField =
    doc.querySelector('input[type="password"]') !== null

  const host = loc.hostname || ""
  const path = (loc.pathname || "").toLowerCase()

  for (const pattern of SENSITIVE_HOST_PATTERNS) {
    if (pattern.test(host)) {
      return {
        excluded: true,
        reason: `Wrażliwa domena (${host}) — skan wyłączony domyślnie`,
        hasPasswordField
      }
    }
  }

  for (const hint of SENSITIVE_PATH_HINTS) {
    if (path.startsWith(hint)) {
      return {
        excluded: true,
        reason: `Wrażliwa ścieżka (${hint}) — skan wyłączony domyślnie`,
        hasPasswordField
      }
    }
  }

  // A password field present on an otherwise-ordinary page: don't hard-exclude,
  // but the page context flags it so features limit themselves and never read it.
  return { excluded: false, hasPasswordField }
}
