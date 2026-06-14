import { hashPathWithoutRawUrl } from "../../shared/aiDeepDive/normalize"
import type { AiDeepDiveRiskResult } from "../../shared/aiDeepDive/types"

const FALLBACK_DELAY_MS = 900
const FALLBACK_EVIDENCE_TAG = "dom_scan_unavailable"

interface RegisterDeps {
  tabs: typeof chrome.tabs | undefined
  recordResult: (result: AiDeepDiveRiskResult) => Promise<unknown>
  extractRestrictedPageRisk?: (
    tabId: number,
    tabUrl: string | undefined
  ) => Promise<AiDeepDiveRiskResult | null>
}

const timers = new Map<number, ReturnType<typeof setTimeout>>()
const lastFallbackSignatureByTab = new Map<number, string>()

export function canDomScannerRunOnUrl(tabUrl: string | undefined): boolean {
  if (!tabUrl) return false

  try {
    const parsed = new URL(tabUrl)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export function createTabCoverageFallbackResult(
  tabUrl: string | undefined,
  timestamp = Date.now()
): AiDeepDiveRiskResult | null {
  if (canDomScannerRunOnUrl(tabUrl)) return null

  const origin = fallbackOrigin(tabUrl)
  const hashInput = fallbackHashInput(tabUrl)

  return {
    type: "AI_DEEP_DIVE_RESULT",
    version: 1,
    level: "low",
    score: 0,
    confidence: 0.2,
    categories: [],
    evidenceTags: [FALLBACK_EVIDENCE_TAG],
    origin,
    urlHash: hashPathWithoutRawUrl(hashInput),
    timestamp,
    model: { mode: "heuristic", id: "coverage-fallback", localOnly: true },
    rawTextRetained: false
  }
}

export async function resolveAiDeepDiveCoverageResult(
  tabId: number,
  tabUrl: string | undefined,
  extractRestrictedPageRisk?: RegisterDeps["extractRestrictedPageRisk"],
  timestamp = Date.now()
): Promise<AiDeepDiveRiskResult | null> {
  const fallback = createTabCoverageFallbackResult(tabUrl, timestamp)
  if (!fallback) return null

  const extracted = extractRestrictedPageRisk
    ? await extractRestrictedPageRisk(tabId, tabUrl).catch(() => null)
    : null

  return extracted ?? fallback
}

export function registerAiDeepDiveTabCoverage(deps: RegisterDeps): void {
  const tabs = deps.tabs
  if (!tabs?.onUpdated || !tabs.onActivated || !tabs.get) return

  tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete") return
    scheduleFallback(tabId, tab.url, deps)
  })

  tabs.onActivated.addListener(({ tabId }) => {
    tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return
      scheduleFallback(tabId, tab.url, deps)
    })
  })
}

function scheduleFallback(
  tabId: number,
  tabUrl: string | undefined,
  deps: RegisterDeps
): void {
  const previousTimer = timers.get(tabId)
  if (previousTimer) {
    clearTimeout(previousTimer)
    timers.delete(tabId)
  }

  const result = createTabCoverageFallbackResult(tabUrl)
  if (!result) return

  const signature = `${result.origin}:${result.urlHash}`
  if (lastFallbackSignatureByTab.get(tabId) === signature) return
  lastFallbackSignatureByTab.set(tabId, signature)

  const timer = setTimeout(() => {
    timers.delete(tabId)
    resolveAiDeepDiveCoverageResult(
      tabId,
      tabUrl,
      deps.extractRestrictedPageRisk
    )
      .then((coverageResult) => {
        if (coverageResult) return deps.recordResult(coverageResult)
        return undefined
      })
      .catch(() => undefined)
  }, FALLBACK_DELAY_MS)
  timers.set(tabId, timer)
}

function fallbackOrigin(tabUrl: string | undefined): string {
  if (!tabUrl) return "unknown-origin"

  try {
    const parsed = new URL(tabUrl)
    if (parsed.protocol === "file:") return "file://local"
    if (parsed.protocol === "about:") {
      return `about://${parsed.pathname || "blank"}`
    }

    const host = parsed.hostname || firstPathSegment(parsed.pathname) || "page"
    return `${parsed.protocol}//${host}`
  } catch {
    return "unknown-origin"
  }
}

function fallbackHashInput(tabUrl: string | undefined): string {
  if (!tabUrl) return "/"

  try {
    const parsed = new URL(tabUrl)
    if (parsed.protocol === "file:") return "file://local"
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}`
  } catch {
    return "unknown"
  }
}

function firstPathSegment(pathname: string): string {
  return pathname.split("/").find(Boolean) ?? ""
}
