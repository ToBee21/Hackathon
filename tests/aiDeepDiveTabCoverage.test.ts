import { vi } from "vitest"

import {
  canDomScannerRunOnUrl,
  createTabCoverageFallbackResult,
  registerAiDeepDiveTabCoverage,
  resolveAiDeepDiveCoverageResult
} from "../src/background/aiDeepDive/tabCoverage"
import type { AiDeepDiveRiskResult } from "../src/shared/aiDeepDive/types"

describe("AI Deep-Dive tab coverage fallback", () => {
  it("leaves normal web pages to the DOM scanner", () => {
    expect(canDomScannerRunOnUrl("https://example.test/article")).toBe(true)
    expect(canDomScannerRunOnUrl("http://example.test/article")).toBe(true)
    expect(createTabCoverageFallbackResult("https://example.test/article", 1)).toBeNull()
  })

  it("creates a compact fallback report for browser pages the content script cannot scan", () => {
    const result = createTabCoverageFallbackResult("chrome://settings/privacy?secret=value", 42)

    expect(result).toMatchObject({
      type: "AI_DEEP_DIVE_RESULT",
      version: 1,
      level: "low",
      score: 0,
      confidence: 0.2,
      categories: [],
      evidenceTags: ["dom_scan_unavailable"],
      origin: "chrome://settings",
      timestamp: 42,
      model: { mode: "heuristic", id: "coverage-fallback", localOnly: true },
      rawTextRetained: false
    })
    expect(result?.urlHash).toMatch(/^p_[a-f0-9]{8}$/)
    expect(JSON.stringify(result)).not.toContain("secret=value")
  })

  it("redacts local file paths in fallback reports", () => {
    const result = createTabCoverageFallbackResult("file:///C:/Users/Ala/private-note.html", 7)

    expect(result?.origin).toBe("file://local")
    expect(result?.evidenceTags).toContain("dom_scan_unavailable")
    expect(JSON.stringify(result)).not.toContain("private-note")
    expect(JSON.stringify(result)).not.toContain("Users")
  })

  it("handles blank pages without throwing", () => {
    const result = createTabCoverageFallbackResult("about:blank", 9)

    expect(result?.origin).toBe("about://blank")
    expect(result?.level).toBe("low")
    expect(result?.rawTextRetained).toBe(false)
  })

  it("prefers debugger-derived risk when restricted page text can be extracted", async () => {
    const debuggerRisk: AiDeepDiveRiskResult = {
      type: "AI_DEEP_DIVE_RESULT",
      version: 1,
      level: "high",
      score: 72,
      confidence: 0.82,
      categories: [
        {
          category: "mental_health",
          score: 72,
          confidence: 0.82,
          evidenceTags: ["debugger_dom_text"]
        }
      ],
      evidenceTags: ["debugger_dom_text"],
      origin: "chrome://settings",
      urlHash: "p_debugger",
      timestamp: 101,
      model: { mode: "heuristic", id: "debugger-dom", localOnly: true },
      rawTextRetained: false
    }

    await expect(
      resolveAiDeepDiveCoverageResult(
        3,
        "chrome://settings/privacy",
        async () => debuggerRisk
      )
    ).resolves.toBe(debuggerRisk)
  })

  it("falls back when debugger extraction returns nothing", async () => {
    const result = await resolveAiDeepDiveCoverageResult(
      4,
      "chrome://settings/privacy",
      async () => null,
      202
    )

    expect(result?.level).toBe("low")
    expect(result?.evidenceTags).toEqual(["dom_scan_unavailable"])
    expect(result?.timestamp).toBe(202)
  })

  it("cancels stale about:blank fallback when the tab finishes a normal web page", async () => {
    vi.useFakeTimers()

    try {
      const updatedListeners: Array<
        (
          tabId: number,
          changeInfo: { status?: string },
          tab: { url?: string }
        ) => void
      > = []
      const recordResult = vi.fn(async () => undefined)

      registerAiDeepDiveTabCoverage({
        tabs: {
          onUpdated: {
            addListener: (
              listener: (typeof updatedListeners)[number]
            ) => updatedListeners.push(listener)
          },
          onActivated: {
            addListener: vi.fn()
          },
          get: vi.fn()
        } as unknown as typeof chrome.tabs,
        recordResult
      })

      updatedListeners[0]?.(15, { status: "complete" }, { url: "about:blank" })
      updatedListeners[0]?.(15, { status: "complete" }, { url: "https://onet.pl/" })

      await vi.advanceTimersByTimeAsync(1000)

      expect(recordResult).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
