// src/shared/features/aiProfilingDetector.ts
// Feature A — AI Profiling Detector. Reuses the existing local risk verdict
// (heuristic, or fused with NLI/LLM when the user enabled a model) and renders a
// card describing how profilable the page is. No new model work here: it consumes
// FeatureContext.risk, so the card's `source` honestly mirrors how that verdict
// was produced.

import { AI_DEEP_DIVE_CATEGORY_LABELS } from "../aiDeepDive/categories"
import type { Feature, CardLevel, FeatureCard } from "../featureRegistry"

const ACTION: Record<string, string> = {
  critical: "Rozważ tryb incognito + Max Camo; nie loguj się tu pod głównym kontem.",
  high: "Włącz Max Camo i unikaj podawania danych osobowych na tej stronie.",
  medium: "Uważaj co wpisujesz; trackery mogą wywnioskować wrażliwe cechy.",
  low: "Niskie ryzyko profilowania na tej stronie."
}

function toCardLevel(level: string): CardLevel {
  if (level === "critical" || level === "high" || level === "medium") return level
  return "low"
}

function modelSourceToCardSource(
  mode: string | undefined
): FeatureCard["source"] {
  if (mode === "heuristic+llm-json") return "llm-json"
  if (mode === "heuristic+nli") return "nli"
  return "heuristic"
}

export const aiProfilingDetector: Feature = {
  featureId: "ai-profiling-detector",
  title: "AI Profiling Detector",
  shortDescription:
    "Czy ta strona może ujawnić wrażliwe cechy przy analizie przez trackery/LLM.",
  riskLevel: "high",
  requiredCapabilities: ["page-text"],
  activation: (page) => !page.excluded && page.visibleText.length > 0,
  run: ({ risk }) => {
    const level = toCardLevel(risk.level)
    const categories = risk.categories
      .slice(0, 3)
      .map((entry) => AI_DEEP_DIVE_CATEGORY_LABELS[entry.category])
      .filter(Boolean)

    const lines =
      categories.length > 0
        ? [`Wykryte wrażliwe sygnały: ${categories.join(", ")}.`]
        : ["Brak wyraźnych wrażliwych kategorii na tej stronie."]

    return {
      featureId: "ai-profiling-detector",
      title: "AI Profiling Detector",
      level,
      score: risk.score,
      lines,
      evidence: risk.evidenceTags.slice(0, 4),
      action: ACTION[level] ?? ACTION.low,
      source: modelSourceToCardSource(risk.model?.mode)
    }
  }
}
