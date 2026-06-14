// src/shared/aiDeepDive/gate.ts
// Transformers-free gate: decides whether to ask for a heavy model scan. Lives in
// its own module (no @huggingface/transformers import) so content scripts can
// import it without pulling the model bundle into the page's content-script chunk.

import type { AiDeepDiveRuntimeConfig } from "./config"
import type { AiDeepDiveRiskResult } from "./types"

export function shouldRunModel(
  heuristic: AiDeepDiveRiskResult,
  config: AiDeepDiveRuntimeConfig
): boolean {
  if (!config.aiModeEnabled) return false
  if (heuristic.level === "low") return false
  return heuristic.score >= config.nliMinHeuristicScore
}
