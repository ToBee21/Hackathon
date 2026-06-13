// src/shared/pageContextSchema.ts
// The normalized "what is this page" object the floating layer and side panel
// reason over. This is the contract between extraction (content/pageContext.ts)
// and every feature in the registry. Keep it JSON-serializable and free of raw
// secrets — it may cross the message bus to the side panel.

export interface PageOpenGraph {
  title?: string
  description?: string
  type?: string
  siteName?: string
}

export interface PageContext {
  url: string
  origin: string
  title: string
  meta: string
  og: PageOpenGraph
  headings: string[]
  /** Cleaned, bounded visible article-ish text. Never form input values. */
  visibleText: string
  /** Current user text selection (empty unless the user selected something). */
  selectedText: string
  hasForms: boolean
  /** A password field is present — scanning is limited and content never read. */
  hasPasswordField: boolean
  /** A cookie/consent banner was heuristically detected. */
  hasConsentBanner: boolean
  /** True when the guard decided this page must not be scanned by default. */
  excluded: boolean
  excludedReason?: string
  capturedAt: number
}

export function emptyPageContext(): PageContext {
  return {
    url: "",
    origin: "",
    title: "",
    meta: "",
    og: {},
    headings: [],
    visibleText: "",
    selectedText: "",
    hasForms: false,
    hasPasswordField: false,
    hasConsentBanner: false,
    excluded: false,
    capturedAt: 0
  }
}

/** Compact, single-line label used for the floating header / side panel. */
export function describePage(page: PageContext): string {
  const host = safeHost(page.url) || page.origin
  const kind = page.hasPasswordField
    ? "login / account"
    : page.hasForms
      ? "form page"
      : page.headings[0]
        ? "article / content"
        : "page"
  return `${kind} · ${host}`
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ""
  }
}
