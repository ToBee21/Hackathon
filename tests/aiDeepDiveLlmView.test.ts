import {
  buildLlmInsightFromRiskResult,
  formatVerdictLabel,
  parseLlmInsightJson
} from "../src/shared/aiDeepDive/llmView"

describe("AI Deep-Dive LLM insight view", () => {
  it("turns a raw LLM JSON response into a product insight", () => {
    const insight = parseLlmInsightJson(`
      model said:
      \`\`\`json
      {"verdict":"critical","score":94,"reason":"Mental health and debt signals are present.","sensitiveSignals":[{"category":"financial_distress","score":89,"evidence":"unpaid debt"},{"category":"mental_health","score":82,"evidence":"depression"}],"profilingRisk":92,"manipulationRisk":18,"source":"llm-json","modelId":"onnx-community/granite-4.0-350m-ONNX-web"}
      \`\`\`
    `)

    expect(insight).not.toBeNull()
    expect(insight?.verdict).toBe("critical")
    expect(insight?.score).toBe(94)
    expect(insight?.reason).toBe(
      "Mental health and debt signals are present."
    )
    expect(insight?.sensitiveSignals.map((signal) => signal.label)).toEqual([
      "problemy finansowe",
      "zdrowie psychiczne"
    ])
    expect(insight?.profilingRisk).toBe(92)
    expect(insight?.manipulationRisk).toBe(18)
  })

  it("derives the verdict from score when the model omits it", () => {
    const insight = parseLlmInsightJson('{"score":72,"reason":"x"}')

    expect(insight?.verdict).toBe("high")
    expect(formatVerdictLabel(insight?.verdict ?? "low")).toBe("wysokie")
  })

  it("returns null until a complete JSON object exists", () => {
    expect(parseLlmInsightJson('{"score":72')).toBeNull()
    expect(parseLlmInsightJson("still generating")).toBeNull()
  })

  it("builds a product insight from the final fused risk result", () => {
    const insight = buildLlmInsightFromRiskResult({
      type: "AI_DEEP_DIVE_RESULT",
      version: 1,
      level: "high",
      score: 88,
      confidence: 0.75,
      categories: [
        {
          category: "mental_health",
          score: 82,
          confidence: 0.8,
          evidenceTags: ["llm_mental_health"]
        }
      ],
      evidenceTags: ["llm_mental_health"],
      origin: "https://example.test",
      urlHash: "abc",
      timestamp: 0,
      model: {
        mode: "heuristic+llm-json",
        id: "onnx-community/granite-4.0-350m-ONNX-web",
        localOnly: true
      },
      rawTextRetained: false
    })

    expect(insight.source).toBe("llm-json")
    expect(insight.sensitiveSignals[0].label).toBe("zdrowie psychiczne")
    expect(insight.reason).toContain("Lokalny model")
  })
})
