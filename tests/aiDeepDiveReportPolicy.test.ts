import {
  shouldLogAiDeepDiveReport,
  shouldSendAiDeepDiveReport,
  shouldShowAiDeepDiveNotification
} from "../src/shared/aiDeepDive/reportPolicy"
import type { AiDeepDiveRiskResult } from "../src/shared/aiDeepDive/types"

function result(level: AiDeepDiveRiskResult["level"]): AiDeepDiveRiskResult {
  return {
    type: "AI_DEEP_DIVE_RESULT",
    version: 1,
    level,
    score: level === "low" ? 8 : level === "medium" ? 36 : level === "high" ? 72 : 92,
    confidence: 0.8,
    categories: [],
    evidenceTags: [],
    origin: "https://example.test",
    urlHash: "p_test",
    timestamp: 1,
    model: { mode: "heuristic", localOnly: true },
    rawTextRetained: false
  }
}

describe("AI Deep-Dive report policy", () => {
  it("does not emit page reports by default", () => {
    expect(shouldSendAiDeepDiveReport(result("low"))).toBe(false)
    expect(shouldSendAiDeepDiveReport(result("medium"))).toBe(false)
    expect(shouldSendAiDeepDiveReport(result("high"))).toBe(false)
    expect(shouldSendAiDeepDiveReport(result("critical"))).toBe(false)
  })

  it("shows page notification only for serious risk", () => {
    expect(shouldShowAiDeepDiveNotification(result("low"))).toBe(false)
    expect(shouldShowAiDeepDiveNotification(result("medium"))).toBe(false)
    expect(shouldShowAiDeepDiveNotification(result("high"))).toBe(true)
    expect(shouldShowAiDeepDiveNotification(result("critical"))).toBe(true)
  })

  it("keeps low-risk pages out of collapsed logs", () => {
    expect(shouldLogAiDeepDiveReport(result("low"))).toBe(false)
    expect(shouldLogAiDeepDiveReport(result("medium"))).toBe(true)
    expect(shouldLogAiDeepDiveReport(result("high"))).toBe(true)
    expect(shouldLogAiDeepDiveReport(result("critical"))).toBe(true)
  })
})
