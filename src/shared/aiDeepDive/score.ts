import { EMOTIONAL_INTENT_TERMS, RISK_CLUSTERS } from "./dictionaries"
import { clamp, hashPathWithoutRawUrl, normalizeForRisk } from "./normalize"
import type {
  AiDeepDiveCategory,
  AiDeepDiveCategoryScore,
  AiDeepDiveInput,
  AiDeepDiveRiskLevel,
  AiDeepDiveRiskResult
} from "./types"

const LEVELS = {
  low: 25,
  medium: 55,
  high: 80
} as const

const CATEGORY_SCORE_FLOOR = 15
const NEGATION_RE = /\b(without|no|not|never|brak|bez|nie)\b/i

interface ClusterScore {
  category: AiDeepDiveCategory
  clusterId: string
  score: number
  matches: number
}

export function classifyHeuristic(input: AiDeepDiveInput): AiDeepDiveRiskResult {
  const title = normalizeForRisk(input.title)
  const meta = normalizeForRisk(input.meta)
  const headings = normalizeForRisk(input.headings)
  const body = normalizeForRisk(input.body)
  const text = [title, meta, headings, body].filter(Boolean).join(" ").slice(0, 12_000)

  const clusterScores = scoreClusters(text, title, headings)
  const categoryScores = scoreCategories(clusterScores)
  const maxCategory = Math.max(0, ...categoryScores.map((entry) => entry.score))
  const emotionalIntentBoost = scoreEmotionalIntent(text)
  const densityBoost = scoreSensitiveDensity(categoryScores)
  const score = clamp(Math.round(maxCategory + emotionalIntentBoost + densityBoost), 0, 100)

  return {
    type: "AI_DEEP_DIVE_RESULT",
    version: 1,
    level: levelForScore(score),
    score,
    confidence: estimateConfidence(categoryScores, text.length),
    categories: categoryScores.filter((entry) => entry.score >= CATEGORY_SCORE_FLOOR),
    evidenceTags: collectEvidenceTags(categoryScores),
    origin: input.origin,
    urlHash: hashPathWithoutRawUrl(input.path),
    timestamp: Date.now(),
    model: { mode: "heuristic", localOnly: true },
    rawTextRetained: false
  }
}

function scoreClusters(text: string, title: string, headings: string): ClusterScore[] {
  return RISK_CLUSTERS.map((cluster) => {
    const matches = cluster.terms.filter((term) => hasTerm(text, normalizeForRisk(term))).length
    if (matches === 0) {
      return { category: cluster.category, clusterId: cluster.clusterId, score: 0, matches: 0 }
    }

    const titleHit = cluster.terms.some((term) => hasTerm(title, normalizeForRisk(term)))
    const headingHit = cluster.terms.some((term) => hasTerm(headings, normalizeForRisk(term)))
    const multiplier = titleHit ? 1.35 : headingHit ? 1.2 : 1
    const diversityBonus = Math.min(12, Math.max(0, matches - 1) * 3)
    const score = clamp(Math.round((cluster.weight + diversityBonus) * multiplier), 0, 70)

    return {
      category: cluster.category,
      clusterId: cluster.clusterId,
      score,
      matches
    }
  })
}

function scoreCategories(clusterScores: ClusterScore[]): AiDeepDiveCategoryScore[] {
  const grouped = new Map<AiDeepDiveCategory, ClusterScore[]>()

  for (const cluster of clusterScores) {
    if (cluster.score <= 0) continue
    grouped.set(cluster.category, [...(grouped.get(cluster.category) ?? []), cluster])
  }

  return Array.from(grouped.entries())
    .map(([category, clusters]) => {
      const raw = clusters.reduce((sum, cluster) => sum + cluster.score, 0)
      const multiClusterBonus = clusters.length > 1 ? 8 : 0
      const matchCount = clusters.reduce((sum, cluster) => sum + cluster.matches, 0)
      const score = clamp(raw + multiClusterBonus, 0, 88)

      return {
        category,
        score,
        confidence: clamp(0.35 + clusters.length * 0.18 + Math.min(0.24, matchCount * 0.04), 0, 1),
        evidenceTags: clusters.map((cluster) => cluster.clusterId)
      }
    })
    .sort((a, b) => b.score - a.score)
}

function hasTerm(text: string, term: string): boolean {
  if (!term) return false

  let index = text.indexOf(term)
  while (index >= 0) {
    const before = text.slice(Math.max(0, index - 28), index)
    if (!NEGATION_RE.test(before)) return true
    index = text.indexOf(term, index + term.length)
  }

  return false
}

function scoreEmotionalIntent(text: string): number {
  const hits = EMOTIONAL_INTENT_TERMS.filter((term) => hasTerm(text, normalizeForRisk(term))).length
  if (hits === 0) return 0
  return clamp(6 + hits * 3, 0, 18)
}

function scoreSensitiveDensity(categories: AiDeepDiveCategoryScore[]): number {
  const active = categories.filter((entry) => entry.score >= CATEGORY_SCORE_FLOOR)
  if (active.length < 2) return 0
  return clamp((active.length - 1) * 8, 0, 18)
}

function levelForScore(score: number): AiDeepDiveRiskLevel {
  if (score >= LEVELS.high) return "critical"
  if (score >= LEVELS.medium) return "high"
  if (score >= LEVELS.low) return "medium"
  return "low"
}

function estimateConfidence(categories: AiDeepDiveCategoryScore[], textLength: number): number {
  if (categories.length === 0) return textLength > 200 ? 0.55 : 0.35
  const strongest = Math.max(...categories.map((entry) => entry.confidence))
  const lengthBonus = textLength > 800 ? 0.08 : textLength > 250 ? 0.04 : 0
  return clamp(strongest + lengthBonus, 0, 1)
}

function collectEvidenceTags(categories: AiDeepDiveCategoryScore[]): string[] {
  return Array.from(
    new Set(
      categories
        .filter((entry) => entry.score >= CATEGORY_SCORE_FLOOR)
        .flatMap((entry) => entry.evidenceTags)
    )
  ).slice(0, 8)
}

