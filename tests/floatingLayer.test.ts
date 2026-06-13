import { evaluatePageGuard } from "../src/content/sensitivePageGuard"
import {
  registerFeature,
  runActiveFeatures,
  sortCards
} from "../src/shared/featureRegistry"
import { aiProfilingDetector } from "../src/shared/features/aiProfilingDetector"
import { pageExplainer } from "../src/shared/features/pageExplainer"
import { emptyPageContext } from "../src/shared/pageContextSchema"
import type { AiDeepDiveRiskResult } from "../src/shared/aiDeepDive/types"

function fakeDoc(hasPassword: boolean): Document {
  return {
    querySelector: (sel: string) =>
      sel.includes("password") && hasPassword ? ({} as Element) : null
  } as unknown as Document
}

function fakeLoc(hostname: string, pathname = "/"): Location {
  return { hostname, pathname } as unknown as Location
}

const highRisk: AiDeepDiveRiskResult = {
  type: "AI_DEEP_DIVE_RESULT",
  version: 1,
  level: "high",
  score: 78,
  confidence: 0.72,
  categories: [
    { category: "mental_health", score: 80, confidence: 0.8, evidenceTags: ["nli_mental_health"] }
  ],
  evidenceTags: ["mental_health"],
  origin: "https://example.test",
  urlHash: "abc",
  timestamp: 0,
  model: { mode: "heuristic", localOnly: true },
  rawTextRetained: false
}

describe("sensitive page guard", () => {
  it("excludes banking domains", () => {
    const v = evaluatePageGuard(fakeDoc(false), fakeLoc("login.mbank.pl"))
    expect(v.excluded).toBe(true)
    expect(v.reason).toMatch(/domena/i)
  })

  it("excludes sensitive paths like /login", () => {
    const v = evaluatePageGuard(fakeDoc(false), fakeLoc("shop.example.com", "/login"))
    expect(v.excluded).toBe(true)
  })

  it("does not exclude ordinary pages but flags password fields", () => {
    const v = evaluatePageGuard(fakeDoc(true), fakeLoc("blog.example.com", "/post/1"))
    expect(v.excluded).toBe(false)
    expect(v.hasPasswordField).toBe(true)
  })
})

describe("feature registry", () => {
  it("renders cards from registered features, not hardcoded, sorted by level", () => {
    registerFeature(aiProfilingDetector)
    registerFeature(pageExplainer)

    const page = {
      ...emptyPageContext(),
      url: "https://example.test/article",
      origin: "https://example.test",
      title: "Coping with depression and debt",
      headings: ["Mental health support"],
      visibleText: "Guide about depression symptoms and unpaid debt help."
    }

    const cards = sortCards(runActiveFeatures({ page, risk: highRisk }))
    const ids = cards.map((c) => c.featureId)

    expect(ids).toContain("ai-profiling-detector")
    expect(ids).toContain("page-explainer")

    const profiling = cards.find((c) => c.featureId === "ai-profiling-detector")
    expect(profiling?.score).toBe(78)
    expect(profiling?.source).toBe("heuristic")
    // High-risk card must sort before the informational explainer.
    expect(cards[0].featureId).toBe("ai-profiling-detector")
  })

  it("renders nothing for excluded pages", () => {
    registerFeature(aiProfilingDetector)
    const page = { ...emptyPageContext(), excluded: true, title: "Bank" }
    const cards = runActiveFeatures({ page, risk: highRisk })
    expect(cards.length).toBe(0)
  })

  it("labels llm-json source when the verdict was fused with the LLM", () => {
    registerFeature(aiProfilingDetector)
    const page = {
      ...emptyPageContext(),
      title: "x",
      visibleText: "some content"
    }
    const fused: AiDeepDiveRiskResult = {
      ...highRisk,
      model: { mode: "heuristic+llm-json", id: "onnx-community/gemma-4-E2B-it-ONNX", localOnly: true }
    }
    const cards = runActiveFeatures({ page, risk: fused })
    const profiling = cards.find((c) => c.featureId === "ai-profiling-detector")
    expect(profiling?.source).toBe("llm-json")
  })
})
