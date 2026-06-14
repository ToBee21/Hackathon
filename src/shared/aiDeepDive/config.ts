import {
  DEFAULT_AI_DEEP_DIVE_MODEL_ID,
  isKnownModelId
} from "./models"

export const STORAGE_KEY_AI_DEEP_DIVE_CONFIG = "cnd:ai-deep-dive:config"

export interface AiDeepDiveRuntimeConfig {
  aiModeEnabled: boolean
  /** Which model from the registry handles enabled scans (NLI vs LLM-JSON). */
  selectedModelId: string
  nliMinHeuristicScore: number
  maxSnippetChars: number
}

export const DEFAULT_AI_DEEP_DIVE_CONFIG: AiDeepDiveRuntimeConfig = {
  aiModeEnabled: false,
  selectedModelId: DEFAULT_AI_DEEP_DIVE_MODEL_ID,
  nliMinHeuristicScore: 25,
  maxSnippetChars: 2500
}

export function normalizeAiDeepDiveConfig(
  value: Partial<AiDeepDiveRuntimeConfig> | null | undefined
): AiDeepDiveRuntimeConfig {
  return {
    aiModeEnabled: Boolean(value?.aiModeEnabled),
    selectedModelId: isKnownModelId(value?.selectedModelId)
      ? (value?.selectedModelId as string)
      : DEFAULT_AI_DEEP_DIVE_MODEL_ID,
    nliMinHeuristicScore: clampNumber(
      value?.nliMinHeuristicScore,
      0,
      100,
      DEFAULT_AI_DEEP_DIVE_CONFIG.nliMinHeuristicScore
    ),
    maxSnippetChars: clampNumber(
      value?.maxSnippetChars,
      500,
      4000,
      DEFAULT_AI_DEEP_DIVE_CONFIG.maxSnippetChars
    )
  }
}

function clampNumber(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value as number)))
}

