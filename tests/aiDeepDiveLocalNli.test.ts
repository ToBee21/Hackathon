import {
  buildNliSnippet,
  fuseNliOutput,
  shouldRunLocalNli
} from "../src/shared/aiDeepDive/localNli"
import { DEFAULT_AI_DEEP_DIVE_CONFIG } from "../src/shared/aiDeepDive/config"
import { classifyHeuristic } from "../src/shared/aiDeepDive/score"

const input = {
  title: "Urgent support for depression and unpaid debt",
  meta: "Synthetic privacy fixture",
  headings: "Financial hardship and therapy support",
  body: `
    Guide for people dealing with depression symptoms, suicidal thoughts,
    unpaid debt, eviction fear, bankruptcy risk and urgent financial hardship.
  `,
  origin: "https://example.test",
  path: "/demo"
}

describe("AI Deep-Dive local NLI adapter", () => {
  it("keeps local NLI disabled by default", () => {
    const heuristic = classifyHeuristic(input)

    expect(shouldRunLocalNli(heuristic, DEFAULT_AI_DEEP_DIVE_CONFIG)).toBe(false)
  })

  it("runs local NLI only when the feature flag is enabled and heuristic is not low", () => {
    const heuristic = classifyHeuristic(input)

    expect(
      shouldRunLocalNli(heuristic, {
        ...DEFAULT_AI_DEEP_DIVE_CONFIG,
        aiModeEnabled: true
      })
    ).toBe(true)
  })

  it("builds a bounded snippet without raw URL fields", () => {
    const snippet = buildNliSnippet(
      {
        ...input,
        path: "/private?token=secret"
      },
      120
    )

    expect(snippet.length).toBeLessThanOrEqual(120)
    expect(snippet).not.toContain("token=secret")
  })

  it("fuses zero-shot labels into compact risk categories", () => {
    const heuristic = classifyHeuristic(input)
    const fused = fuseNliOutput(heuristic, {
      sequence: "synthetic",
      labels: [
        "financial distress or debt content",
        "mental health content",
        "ordinary non-sensitive article"
      ],
      scores: [0.91, 0.84, 0.08]
    })

    expect(fused.model).toEqual({
      mode: "heuristic+nli",
      id: "Xenova/nli-deberta-v3-small",
      localOnly: true
    })
    expect(fused.rawTextRetained).toBe(false)
    expect(fused.categories.map((entry) => entry.category)).toContain(
      "financial_distress"
    )
    expect(fused.evidenceTags).toContain("nli_financial_distress")
  })
})
