import type { AiDeepDiveCategory } from "./types"

export const AI_DEEP_DIVE_CATEGORY_LABELS: Record<AiDeepDiveCategory, string> = {
  mental_health: "zdrowie psychiczne",
  politics_extreme: "radykalizacja polityczna",
  medical: "zdrowie / leczenie",
  financial_distress: "problemy finansowe",
  legal: "problemy prawne",
  identity_life_event: "tożsamość / życie prywatne",
  addiction: "uzależnienie",
  religion: "religia / przekonania"
}

export const AI_DEEP_DIVE_CATEGORY_ORDER: AiDeepDiveCategory[] = [
  "mental_health",
  "financial_distress",
  "medical",
  "politics_extreme",
  "legal",
  "addiction",
  "identity_life_event",
  "religion"
]

