import {
  canDomScannerRunOnUrl,
  createTabCoverageFallbackResult
} from "../src/background/aiDeepDive/tabCoverage"

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
})
