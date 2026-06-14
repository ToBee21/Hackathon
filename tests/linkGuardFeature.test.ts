import { linkGuardFeature } from "../src/shared/features/linkGuardFeature"
import {
  getLinkGuardStats,
  recordBlock,
  recordGate,
  recordOverride,
  recordScan,
  resetLinkGuardStats
} from "../src/shared/linkSafety/linkGuardState"
import type { PageContext } from "../src/shared/pageContextSchema"

const page = { excluded: false } as unknown as PageContext
const ctx = { page, risk: {} as never }

describe("Link Guard session state", () => {
  beforeEach(() => resetLinkGuardStats())

  it("startuje z zerami i networkCalls = 0", () => {
    const s = getLinkGuardStats()
    expect(s.linksScanned).toBe(0)
    expect(s.networkCalls).toBe(0)
    expect(s.lastVerdict).toBeNull()
  })

  it("zlicza skany i flaguje wysokie ryzyko", () => {
    recordScan({ domain: "ok.com", level: "low", score: 5, odds: 95 }, false)
    recordScan({ domain: "evil.tk", level: "critical", score: 90, odds: 10 }, true)
    const s = getLinkGuardStats()
    expect(s.linksScanned).toBe(2)
    expect(s.highRiskFlagged).toBe(1)
    expect(s.lastVerdict?.domain).toBe("evil.tk")
    expect(s.networkCalls).toBe(0)
  })

  it("zlicza bramkę, blokady i świadome przejścia", () => {
    recordGate()
    recordGate()
    recordBlock()
    recordOverride()
    const s = getLinkGuardStats()
    expect(s.clicksGated).toBe(2)
    expect(s.clicksBlocked).toBe(1)
    expect(s.clicksOverridden).toBe(1)
  })
})

describe("Link Guard feature card", () => {
  beforeEach(() => resetLinkGuardStats())

  it("jest aktywna na zwykłych stronach, nieaktywna na wykluczonych", () => {
    expect(linkGuardFeature.activation({ excluded: false } as never)).toBe(true)
    expect(linkGuardFeature.activation({ excluded: true } as never)).toBe(false)
  })

  it("renderuje kartę low z dowodem zero-network gdy brak ryzyka", () => {
    recordScan({ domain: "ok.com", level: "low", score: 5, odds: 95 }, false)
    const card = linkGuardFeature.run(ctx)!
    expect(card.level).toBe("low")
    expect(card.source).toBe("heuristic")
    expect(card.lines[0]).toContain("0 połączeń sieciowych")
    expect(card.score).toBeUndefined()
  })

  it("podnosi poziom i pokazuje wynik gdy wykryto wysokie ryzyko", () => {
    recordScan({ domain: "evil.tk", level: "critical", score: 88, odds: 12 }, true)
    recordGate()
    const card = linkGuardFeature.run(ctx)!
    expect(card.level).toBe("critical")
    expect(card.score).toBe(88)
    expect(card.lines.some((l) => l.includes("wysokiego ryzyka"))).toBe(true)
    expect(card.lines.some((l) => l.includes("evil.tk"))).toBe(true)
  })

  it("używa polskiej odmiany liczebnika", () => {
    recordScan({ domain: "a.com", level: "low", score: 1, odds: 99 }, false)
    const one = linkGuardFeature.run(ctx)!
    expect(one.lines[0]).toContain("1 link na hover")
    recordScan({ domain: "b.com", level: "low", score: 1, odds: 99 }, false)
    recordScan({ domain: "c.com", level: "low", score: 1, odds: 99 }, false)
    const few = linkGuardFeature.run(ctx)!
    expect(few.lines[0]).toContain("3 linki")
    for (let i = 0; i < 2; i++) recordScan({ domain: "x.com", level: "low", score: 1, odds: 99 }, false)
    const many = linkGuardFeature.run(ctx)!
    expect(many.lines[0]).toContain("5 linków")
  })
})
