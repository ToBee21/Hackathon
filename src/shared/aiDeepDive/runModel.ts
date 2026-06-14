// src/shared/aiDeepDive/runModel.ts
// Single entry point the content scanner uses to run the user-selected model.
// Gating is identical for every model (feature flag + heuristic threshold); the
// only branch is which on-device runtime handles the snippet — zero-shot NLI or
// generative LLM-JSON.

import type { AiDeepDiveRuntimeConfig } from "./config"
import { classifyWithLocalLlm } from "./localLlm"
import { classifyWithLocalNli, shouldRunLocalNli } from "./localNli"
import { getModelOption } from "./models"
import type { AiDeepDiveInput, AiDeepDiveRiskResult } from "./types"

// Same gate for every model tier (was named for the original NLI-only path).
export const shouldRunSelectedModel = shouldRunLocalNli

export function classifyWithSelectedModel(
  input: AiDeepDiveInput,
  heuristic: AiDeepDiveRiskResult,
  config: AiDeepDiveRuntimeConfig
): Promise<AiDeepDiveRiskResult> {
  const model = getModelOption(config.selectedModelId)
  if (model.task === "text-generation") {
    return classifyWithLocalLlm(input, heuristic, config, model)
  }
  return classifyWithLocalNli(input, heuristic, config)
}
