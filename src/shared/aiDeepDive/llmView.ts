import {
  AI_DEEP_DIVE_CATEGORY_LABELS,
  AI_DEEP_DIVE_CATEGORY_ORDER
} from "./categories"
import type {
  AiDeepDiveCategory,
  AiDeepDiveRiskLevel,
  AiDeepDiveRiskResult
} from "./types"

export interface LlmInsightSignal {
  category: string
  label: string
  score: number
  evidence?: string
}

export interface LlmInsightView {
  verdict: AiDeepDiveRiskLevel
  score: number
  reason: string
  sensitiveSignals: LlmInsightSignal[]
  profilingRisk: number
  manipulationRisk: number
  source?: string
  modelId?: string
}

const VERDICTS: AiDeepDiveRiskLevel[] = ["low", "medium", "high", "critical"]

export function parseLlmInsightJson(text: string): LlmInsightView | null {
  const json = extractFirstJsonObject(text)
  if (!json) return null

  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!raw || typeof raw !== "object") return null

  const obj = raw as Record<string, unknown>
  const score = clampInt(
    firstNumber(obj.score, obj.risk, obj.profilingRisk, obj.manipulationRisk),
    0,
    100
  )
  const profilingRisk = clampInt(firstNumber(obj.profilingRisk, score), 0, 100)
  const manipulationRisk = clampInt(
    firstNumber(obj.manipulationRisk, 0),
    0,
    100
  )

  return {
    verdict: normalizeVerdict(obj.verdict, score),
    score,
    reason:
      typeof obj.reason === "string" && obj.reason.trim()
        ? obj.reason.trim()
        : "Model wykrył podwyższone ryzyko profilowania tej strony.",
    sensitiveSignals: normalizeSignals(obj),
    profilingRisk,
    manipulationRisk,
    source: typeof obj.source === "string" ? obj.source : undefined,
    modelId: typeof obj.modelId === "string" ? obj.modelId : undefined
  }
}

export function formatVerdictLabel(verdict: AiDeepDiveRiskLevel): string {
  switch (verdict) {
    case "critical":
      return "krytyczne"
    case "high":
      return "wysokie"
    case "medium":
      return "umiarkowane"
    default:
      return "niskie"
  }
}

export function buildLlmInsightFromRiskResult(
  result: AiDeepDiveRiskResult
): LlmInsightView {
  return {
    verdict: result.level,
    score: clampInt(result.score, 0, 100),
    reason: "Lokalny model wskazał, że ta strona może ujawniać wrażliwe cechy użytkownika podczas profilowania.",
    sensitiveSignals: result.categories
      .map((entry) => ({
        category: entry.category,
        label: AI_DEEP_DIVE_CATEGORY_LABELS[entry.category],
        score: clampInt(entry.score, 0, 100),
        evidence: entry.evidenceTags[0]?.replace(/^llm_/, "")
      }))
      .slice(0, 4),
    profilingRisk: clampInt(result.score, 0, 100),
    manipulationRisk: clampInt(
      Math.round(result.score * Math.max(result.confidence, 0.25) * 0.35),
      0,
      100
    ),
    source:
      result.model?.mode === "heuristic+llm-json"
        ? "llm-json"
        : result.model?.mode,
    modelId: result.model?.id
  }
}

function normalizeSignals(obj: Record<string, unknown>): LlmInsightSignal[] {
  const rawSignals = Array.isArray(obj.sensitiveSignals)
    ? obj.sensitiveSignals
    : Array.isArray(obj.categories)
      ? obj.categories
      : []

  const order = new Map(
    AI_DEEP_DIVE_CATEGORY_ORDER.map((category, index) => [category, index])
  )
  const signals: LlmInsightSignal[] = []

  for (const entry of rawSignals) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>
    const category = String(record.category ?? "").trim()
    const label = isKnownCategory(category)
      ? AI_DEEP_DIVE_CATEGORY_LABELS[category]
      : humanizeCategory(category)
    if (!category || !label) continue

    const signal: LlmInsightSignal = {
      category,
      label,
      score: clampInt(firstNumber(record.score, 0), 0, 100)
    }
    if (typeof record.evidence === "string" && record.evidence.trim()) {
      signal.evidence = record.evidence.trim()
    }
    signals.push(signal)
  }

  return signals
    .sort((a, b) => {
      const scoreDiff = b.score - a.score
      if (scoreDiff !== 0) return scoreDiff
      return (order.get(a.category as AiDeepDiveCategory) ?? 99) -
        (order.get(b.category as AiDeepDiveCategory) ?? 99)
    })
    .slice(0, 4)
}

function normalizeVerdict(
  value: unknown,
  score: number
): AiDeepDiveRiskLevel {
  const text = String(value ?? "").toLowerCase()
  if (VERDICTS.includes(text as AiDeepDiveRiskLevel)) {
    return text as AiDeepDiveRiskLevel
  }
  if (score >= 85) return "critical"
  if (score >= 65) return "high"
  if (score >= 35) return "medium"
  return "low"
}

function extractFirstJsonObject(text: string): string | null {
  const cleaned = String(text ?? "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim()
  const start = cleaned.indexOf("{")
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === "\"") {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return cleaned.slice(start, i + 1)
    }
  }
  return null
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = typeof value === "string" ? Number(value) : value
    if (typeof parsed === "number" && Number.isFinite(parsed)) return parsed
  }
  return 0
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)))
}

function isKnownCategory(category: string): category is AiDeepDiveCategory {
  return category in AI_DEEP_DIVE_CATEGORY_LABELS
}

function humanizeCategory(category: string): string {
  return category.replace(/[_-]+/g, " ").trim()
}
