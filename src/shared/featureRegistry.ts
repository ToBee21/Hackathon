// src/shared/featureRegistry.ts
// Registry-driven feature system. The floating window and side panel render
// whatever features are registered + active for the current page, instead of
// hardcoding cards. A feature turns (page context + local risk verdict) into a
// renderable card. Features must NOT do their own network I/O — analysis is
// local-first and supplied to them.

import type { AiDeepDiveRiskResult } from "./aiDeepDive/types"
import type { PageContext } from "./pageContextSchema"

export type CardLevel = "low" | "medium" | "high" | "critical" | "info"

export interface FeatureCard {
  featureId: string
  title: string
  level: CardLevel
  /** 0-100 where meaningful (risk features); omitted for informational cards. */
  score?: number
  /** Plain-language explanation lines. */
  lines: string[]
  /** Exact evidence snippets pulled from the page (already page-visible text). */
  evidence?: string[]
  /** Recommended privacy action, if any. */
  action?: string
  /** Honest provenance of this card's verdict. */
  source: "heuristic" | "nli" | "llm-json" | "fused" | "static"
}

export interface FeatureContext {
  page: PageContext
  /** Local risk verdict already computed (heuristic, or fused with a model). */
  risk: AiDeepDiveRiskResult
}

export interface Feature {
  featureId: string
  title: string
  shortDescription: string
  /** Baseline category risk for ordering/filtering. */
  riskLevel: CardLevel
  /** Capabilities the host must provide (e.g. "page-text", "selection"). */
  requiredCapabilities: string[]
  /** Decide whether this feature applies to the current page. */
  activation: (page: PageContext) => boolean
  /** Produce a card, or null to render nothing this cycle. */
  run: (ctx: FeatureContext) => FeatureCard | null
}

const registry = new Map<string, Feature>()

export function registerFeature(feature: Feature): void {
  registry.set(feature.featureId, feature)
}

export function listFeatures(): Feature[] {
  return Array.from(registry.values())
}

export function activeFeatures(page: PageContext): Feature[] {
  return listFeatures().filter((feature) => {
    try {
      return feature.activation(page)
    } catch {
      return false
    }
  })
}

/** Run every active feature and collect the non-null cards. */
export function runActiveFeatures(ctx: FeatureContext): FeatureCard[] {
  const cards: FeatureCard[] = []
  for (const feature of activeFeatures(ctx.page)) {
    try {
      const card = feature.run(ctx)
      if (card) cards.push(card)
    } catch {
      // A broken feature must never take down the floating UI.
    }
  }
  return cards
}

const LEVEL_ORDER: Record<CardLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4
}

export function sortCards(cards: FeatureCard[]): FeatureCard[] {
  return [...cards].sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      (b.score ?? 0) - (a.score ?? 0)
  )
}
