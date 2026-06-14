export type AiDeepDiveCategory =
  | "mental_health"
  | "politics_extreme"
  | "medical"
  | "financial_distress"
  | "legal"
  | "identity_life_event"
  | "addiction"
  | "religion"

export type AiDeepDiveRiskLevel = "low" | "medium" | "high" | "critical"

export interface AiDeepDiveCategoryScore {
  category: AiDeepDiveCategory
  score: number
  confidence: number
  evidenceTags: string[]
}

export interface AiDeepDiveRiskResult {
  type: "AI_DEEP_DIVE_RESULT"
  version: 1
  level: AiDeepDiveRiskLevel
  score: number
  confidence: number
  categories: AiDeepDiveCategoryScore[]
  evidenceTags: string[]
  origin: string
  urlHash: string
  timestamp: number
  model?: {
    mode: "heuristic" | "heuristic+nli" | "heuristic+llm-json"
    id?: string
    localOnly: true
  }
  rawTextRetained: false
}

export interface AiDeepDiveInput {
  title: string
  meta: string
  headings: string
  body: string
  origin: string
  path?: string
}

