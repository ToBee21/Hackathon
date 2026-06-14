// tests/featureRegistryIntegration.test.ts
// STRONG regression suite for the registry-driven feature system and the five
// real features (aiProfilingDetector, pageExplainer, linkGuardFeature,
// mailGuardFeature, dataFootprintFeature). Pure logic, no DOM/jsdom, zero network.
//
// What this guards against:
//  - registry contract drift (registerFeature / listFeatures / activeFeatures /
//    runActiveFeatures / sortCards),
//  - any feature emitting a malformed FeatureCard (bad level/source/score/lines),
//  - activation gating regressions (excluded pages must yield nothing from
//    features that gate on !page.excluded),
//  - a feature throwing taking down the whole panel,
//  - sortCards severity ordering,
//  - the data-footprint critical-form regression (payment+gov_id+dob).

import { beforeEach, describe, expect, it } from "vitest"

import {
  activeFeatures,
  listFeatures,
  registerFeature,
  runActiveFeatures,
  sortCards,
  type FeatureCard,
  type FeatureContext
} from "../src/shared/featureRegistry"

import { aiProfilingDetector } from "../src/shared/features/aiProfilingDetector"
import { pageExplainer } from "../src/shared/features/pageExplainer"
import { linkGuardFeature } from "../src/shared/features/linkGuardFeature"
import { mailGuardFeature } from "../src/shared/features/mailGuardFeature"
import { dataFootprintFeature } from "../src/shared/features/dataFootprintFeature"

import { classifyHeuristic } from "../src/shared/aiDeepDive/score"
import { emptyPageContext, type PageContext } from "../src/shared/pageContextSchema"

import {
  resetDataFootprint,
  setDataFootprint
} from "../src/shared/dataFootprint/dataFootprintState"
import {
  summarizeFields,
  type FormFieldMeta
} from "../src/shared/dataFootprint/piiFieldHeuristics"
import { resetLinkGuardStats } from "../src/shared/linkSafety/linkGuardState"
import { resetMailGuardStats } from "../src/shared/mailGuard/mailGuardState"

// ---------------------------------------------------------------------------
// Registration. Guard against double-register across test files: every feature
// already registered by another suite would just be re-set, but we only register
// the ones missing so listFeatures() stays clean & assertable.
// ---------------------------------------------------------------------------
const REAL_FEATURES = [
  aiProfilingDetector,
  pageExplainer,
  linkGuardFeature,
  mailGuardFeature,
  dataFootprintFeature
]

function ensureRegistered(): void {
  const present = new Set(listFeatures().map((f) => f.featureId))
  for (const feature of REAL_FEATURES) {
    if (!present.has(feature.featureId)) registerFeature(feature)
  }
}

ensureRegistered()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_LEVELS = ["low", "medium", "high", "critical", "info"] as const
const VALID_SOURCES = ["heuristic", "nli", "llm-json", "fused", "static"] as const

/** A normal, content-rich page that every "!excluded + page-text" feature fires on. */
function normalPage(): PageContext {
  return {
    ...emptyPageContext(),
    url: "https://x.test/a",
    origin: "https://x.test",
    title: "Coping with depression and unpaid debt",
    headings: ["Coping with depression and unpaid debt"],
    visibleText:
      "depression, suicidal thoughts, debt collector, eviction notice and bankruptcy.",
    hasForms: true,
    hasConsentBanner: true
  }
}

/** A page the guard refused to scan — gating features must stay silent. */
function excludedPage(): PageContext {
  return {
    ...emptyPageContext(),
    url: "https://bank.test/login",
    origin: "https://bank.test",
    title: "Bank login",
    headings: ["Bank login"],
    visibleText: "depression debt".repeat(10),
    hasForms: true,
    hasPasswordField: true,
    excluded: true,
    excludedReason: "sensitive-domain"
  }
}

function validRisk() {
  return classifyHeuristic({
    title: "Coping with depression and unpaid debt",
    meta: "",
    headings: "",
    body: "depression, suicidal thoughts, debt collector, eviction",
    origin: "https://x.test",
    path: "/a"
  })
}

function field(partial: Partial<FormFieldMeta>): FormFieldMeta {
  return {
    type: "text",
    name: "",
    id: "",
    autocomplete: "",
    placeholder: "",
    label: "",
    ...partial
  }
}

/** Assert a single card satisfies every FeatureCard invariant. */
function assertCardInvariants(card: FeatureCard): void {
  // non-empty featureId & title
  expect(typeof card.featureId).toBe("string")
  expect(card.featureId.length).toBeGreaterThan(0)
  expect(typeof card.title).toBe("string")
  expect(card.title.length).toBeGreaterThan(0)

  // level enum
  expect(VALID_LEVELS).toContain(card.level)

  // score: optional, but when present an integer in 0..100
  if (card.score !== undefined) {
    expect(Number.isInteger(card.score)).toBe(true)
    expect(card.score).toBeGreaterThanOrEqual(0)
    expect(card.score).toBeLessThanOrEqual(100)
  }

  // source enum
  expect(VALID_SOURCES).toContain(card.source)

  // lines: non-empty string[] of non-empty strings
  expect(Array.isArray(card.lines)).toBe(true)
  expect(card.lines.length).toBeGreaterThan(0)
  for (const line of card.lines) {
    expect(typeof line).toBe("string")
    expect(line.length).toBeGreaterThan(0)
  }

  // evidence: when present, a string[]
  if (card.evidence !== undefined) {
    expect(Array.isArray(card.evidence)).toBe(true)
    for (const e of card.evidence) expect(typeof e).toBe("string")
  }
}

// ---------------------------------------------------------------------------
// Shared setup: clean session state + a known data-footprint so its card has
// content. The depression+debt form is also a focused regression below.
// ---------------------------------------------------------------------------
const CRITICAL_FORM: FormFieldMeta[] = [
  field({ name: "cardnumber", autocomplete: "cc-number" }), // payment
  field({ name: "pesel" }), // gov_id (PL national id)
  field({ name: "dob", autocomplete: "bday" }) // date of birth
]

beforeEach(() => {
  ensureRegistered()
  resetLinkGuardStats()
  resetMailGuardStats()
  resetDataFootprint()
  // Seed a non-empty footprint so dataFootprintFeature produces a card.
  setDataFootprint(summarizeFields(CRITICAL_FORM))
})

// ---------------------------------------------------------------------------
// Registry contract
// ---------------------------------------------------------------------------
describe("feature registry — registration & contract", () => {
  it("has all five real features registered exactly once", () => {
    const ids = listFeatures().map((f) => f.featureId)
    for (const f of REAL_FEATURES) {
      expect(ids.filter((id) => id === f.featureId)).toHaveLength(1)
    }
    expect(ids).toEqual(expect.arrayContaining(REAL_FEATURES.map((f) => f.featureId)))
  })

  it("every registered feature exposes the required shape", () => {
    for (const f of listFeatures()) {
      expect(typeof f.featureId).toBe("string")
      expect(f.featureId.length).toBeGreaterThan(0)
      expect(typeof f.title).toBe("string")
      expect(f.title.length).toBeGreaterThan(0)
      expect(VALID_LEVELS).toContain(f.riskLevel)
      expect(Array.isArray(f.requiredCapabilities)).toBe(true)
      expect(typeof f.activation).toBe("function")
      expect(typeof f.run).toBe("function")
    }
  })
})

// ---------------------------------------------------------------------------
// INVARIANTS — across the full runActiveFeatures output
// ---------------------------------------------------------------------------
describe("runActiveFeatures — card invariants & resilience", () => {
  it("every produced card satisfies all FeatureCard invariants; nothing throws", () => {
    const ctx: FeatureContext = { page: normalPage(), risk: validRisk() }
    let cards: FeatureCard[] = []
    expect(() => {
      cards = runActiveFeatures(ctx)
    }).not.toThrow()
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) assertCardInvariants(card)
  })

  it("a feature that throws does NOT take down the panel", () => {
    const exploding = {
      featureId: "exploding-test-feature",
      title: "boom",
      shortDescription: "throws on run",
      riskLevel: "high" as const,
      requiredCapabilities: [],
      activation: () => true,
      run: () => {
        throw new Error("kaboom")
      }
    }
    registerFeature(exploding)
    try {
      const ctx: FeatureContext = { page: normalPage(), risk: validRisk() }
      let cards: FeatureCard[] = []
      expect(() => {
        cards = runActiveFeatures(ctx)
      }).not.toThrow()
      // The healthy features still produced cards.
      expect(cards.length).toBeGreaterThan(0)
      expect(cards.some((c) => c.featureId === "exploding-test-feature")).toBe(false)
    } finally {
      // Best-effort: there is no unregister API, but neutralize it so later
      // suites/tests aren't affected by the throw.
      exploding.activation = () => false
    }
  })
})

// ---------------------------------------------------------------------------
// ACTIVATION gating
// ---------------------------------------------------------------------------
describe("activation gating", () => {
  it("excluded pages yield NO cards from features that gate on !page.excluded", () => {
    const ctx: FeatureContext = { page: excludedPage(), risk: validRisk() }

    // None of the five real features should activate on an excluded page.
    const active = activeFeatures(ctx.page).map((f) => f.featureId)
    for (const f of REAL_FEATURES) {
      expect(active).not.toContain(f.featureId)
    }

    const cards = runActiveFeatures(ctx)
    for (const f of REAL_FEATURES) {
      expect(cards.some((c) => c.featureId === f.featureId)).toBe(false)
    }
  })

  it("a normal page produces ai-profiling-detector + page-explainer + data-footprint", () => {
    const ctx: FeatureContext = { page: normalPage(), risk: validRisk() }
    const ids = runActiveFeatures(ctx).map((c) => c.featureId)
    expect(ids).toContain("ai-profiling-detector")
    expect(ids).toContain("page-explainer")
    expect(ids).toContain("data-footprint")
  })

  it("aiProfilingDetector needs visible text; page-explainer needs a title/heading", () => {
    const blank = emptyPageContext()
    expect(aiProfilingDetector.activation(blank)).toBe(false)
    expect(pageExplainer.activation(blank)).toBe(false)

    const withText: PageContext = { ...blank, visibleText: "hello world" }
    expect(aiProfilingDetector.activation(withText)).toBe(true)
    expect(pageExplainer.activation(withText)).toBe(false) // still no title/heading

    const withTitle: PageContext = { ...blank, title: "Some page" }
    expect(pageExplainer.activation(withTitle)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Per-feature card sanity on a normal page
// ---------------------------------------------------------------------------
describe("aiProfilingDetector card", () => {
  it("mirrors the local risk verdict (level high, integer score, heuristic source)", () => {
    const ctx: FeatureContext = { page: normalPage(), risk: validRisk() }
    const card = runActiveFeatures(ctx).find((c) => c.featureId === "ai-profiling-detector")!
    expect(card).toBeDefined()
    // depression + unpaid debt → elevated, "high" with the current dictionaries.
    expect(card.level).toBe("high")
    expect(Number.isInteger(card.score)).toBe(true)
    expect(card.score! >= 0 && card.score! <= 100).toBe(true)
    expect(card.source).toBe("heuristic") // model.mode === "heuristic"
    expect(card.lines.join(" ")).toContain("wrażliwe") // sensitive categories listed
  })
})

describe("pageExplainer card", () => {
  it("is a static info card describing the page surface", () => {
    const ctx: FeatureContext = { page: normalPage(), risk: validRisk() }
    const card = runActiveFeatures(ctx).find((c) => c.featureId === "page-explainer")!
    expect(card).toBeDefined()
    expect(card.level).toBe("info")
    expect(card.source).toBe("static")
    expect(card.score).toBeUndefined()
    expect(card.lines[0]).toContain("depression") // subject = title
    // hasForms + hasConsentBanner → exposure line present.
    expect(card.lines.some((l) => l.includes("Powierzchnia danych"))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// sortCards — severity ordering
// ---------------------------------------------------------------------------
describe("sortCards", () => {
  function card(level: FeatureCard["level"], score?: number): FeatureCard {
    return {
      featureId: `f-${level}-${score ?? "x"}`,
      title: level,
      level,
      score,
      lines: [level],
      source: "static"
    }
  }

  it("orders critical/high before medium/low/info", () => {
    const unsorted: FeatureCard[] = [
      card("info"),
      card("low"),
      card("medium"),
      card("critical"),
      card("high")
    ]
    const levels = sortCards(unsorted).map((c) => c.level)
    expect(levels).toEqual(["critical", "high", "medium", "low", "info"])
  })

  it("breaks ties by descending score within a level", () => {
    const sorted = sortCards([card("high", 40), card("high", 90), card("high", 70)])
    expect(sorted.map((c) => c.score)).toEqual([90, 70, 40])
  })

  it("does not mutate the input array", () => {
    const input = [card("low"), card("critical")]
    const before = input.map((c) => c.level)
    sortCards(input)
    expect(input.map((c) => c.level)).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// Focused dataFootprintFeature regression
// ---------------------------------------------------------------------------
describe("dataFootprintFeature — critical form regression", () => {
  it("payment + gov_id + dob summarizes to 'critical' and lists card payment label", () => {
    resetDataFootprint()
    const summary = summarizeFields(CRITICAL_FORM)
    expect(summary.level).toBe("critical") // 30 + 30 + 18 = 78 → critical
    expect(summary.categories).toEqual(["payment", "gov_id", "dob"])

    setDataFootprint(summary)
    const ctx: FeatureContext = { page: normalPage(), risk: validRisk() }
    const cardFromRun = runActiveFeatures(ctx).find((c) => c.featureId === "data-footprint")!
    expect(cardFromRun).toBeDefined()
    expect(cardFromRun.level).toBe("critical")
    expect(cardFromRun.source).toBe("heuristic")
    expect(Number.isInteger(cardFromRun.score)).toBe(true)
    // The card must spell out the payment-card category in Polish.
    expect(cardFromRun.lines[0]).toContain("dane karty płatniczej")
    expect(cardFromRun.evidence).toContain("dane karty płatniczej")
    // Critical/high footprint → the alias-email advice.
    expect(cardFromRun.action).toContain("alias")
  })
})

// ---------------------------------------------------------------------------
// Session-gated features stay quiet without seeded state
// ---------------------------------------------------------------------------
describe("session-gated features", () => {
  it("mail-guard renders nothing until a mail verdict is recorded", () => {
    resetMailGuardStats()
    const ctx: FeatureContext = { page: normalPage(), risk: validRisk() }
    const ids = runActiveFeatures(ctx).map((c) => c.featureId)
    expect(ids).not.toContain("mail-guard")
  })

  it("data-footprint renders nothing when no sensitive fields were collected", () => {
    resetDataFootprint() // empty footprint
    const ctx: FeatureContext = { page: normalPage(), risk: validRisk() }
    const ids = runActiveFeatures(ctx).map((c) => c.featureId)
    expect(ids).not.toContain("data-footprint")
  })

  it("link-guard always renders on a normal page (zero-network proof line)", () => {
    const ctx: FeatureContext = { page: normalPage(), risk: validRisk() }
    const card = runActiveFeatures(ctx).find((c) => c.featureId === "link-guard")!
    expect(card).toBeDefined()
    expect(card.level).toBe("low") // nothing flagged this session
    expect(card.lines[0]).toContain("0 połączeń sieciowych")
  })
})
