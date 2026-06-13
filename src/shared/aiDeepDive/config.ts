export const STORAGE_KEY_AI_DEEP_DIVE_CONFIG = "cnd:ai-deep-dive:config"

export interface AiDeepDiveRuntimeConfig {
  aiModeEnabled: boolean
  nliMinHeuristicScore: number
  maxSnippetChars: number
}

export const DEFAULT_AI_DEEP_DIVE_CONFIG: AiDeepDiveRuntimeConfig = {
  aiModeEnabled: false,
  nliMinHeuristicScore: 25,
  maxSnippetChars: 2500
}

export function normalizeAiDeepDiveConfig(
  value: Partial<AiDeepDiveRuntimeConfig> | null | undefined
): AiDeepDiveRuntimeConfig {
  return {
    aiModeEnabled: Boolean(value?.aiModeEnabled),
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

