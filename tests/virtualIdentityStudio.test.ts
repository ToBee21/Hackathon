import {
  ARCHETYPES,
  DEFAULT_IDENTITY,
  applyArchetype,
  deriveStats,
  getArchetype,
  hardwareFromIndex,
  identityToNoiseTopics,
  identityToProfileBucket,
  matchesArchetype,
  normalizeVirtualIdentityConfig,
  reconcileArchetype,
  type VirtualIdentityConfig
} from "../src/shared/virtualIdentityStudio"

describe("Virtual Identity Studio  -  archetypy", () => {
  it("każdy archetyp ma unikalne id i nakłada się 1:1", () => {
    const ids = ARCHETYPES.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of ARCHETYPES) {
      const config = applyArchetype(a)
      expect(config.archetypeId).toBe(a.id)
      expect(matchesArchetype(config, a)).toBe(true)
    }
  })

  it("reconcile rozpoznaje powrót do archetypu i znika do custom po edycji", () => {
    const gamer = getArchetype("gamer")!
    const base = applyArchetype(gamer)
    // Ten sam zestaw → znów rozpoznany jako preset.
    const back = reconcileArchetype({
      gender: base.gender,
      ageBand: base.ageBand,
      hardware: base.hardware,
      origin: base.origin,
      interests: [...base.interests]
    })
    expect(back.archetypeId).toBe("gamer")
    // Zmiana sprzętu → custom.
    const edited = reconcileArchetype({ ...base, hardware: "budget" })
    expect(edited.archetypeId).toBe("custom")
  })
})

describe("Virtual Identity Studio  -  mapowanie na realne dane", () => {
  it("sprzęt steruje rdzeniami/RAM/GPU, pochodzenie strefą i językiem", () => {
    const config: VirtualIdentityConfig = {
      archetypeId: "custom",
      gender: "male",
      ageBand: "adult",
      hardware: "powerhouse",
      origin: "jp",
      interests: []
    }
    const bucket = identityToProfileBucket(config)
    expect(bucket.hardwareConcurrency).toBe(16)
    expect(bucket.webglRenderer).toContain("RTX 4070")
    expect(bucket.locale).toBe("ja-JP")
    expect(bucket.timezone).toBe("Asia/Tokyo")
    // deviceMemory nigdy nie przekracza 8 (clamp przeglądarki).
    expect(bucket.deviceMemory).toBeLessThanOrEqual(8)
  })

  it("zainteresowania mapują się na unikalne kategorie szumu DataGhost", () => {
    const config: VirtualIdentityConfig = {
      ...DEFAULT_IDENTITY,
      archetypeId: "custom",
      interests: ["travel", "tech", "finance"]
    }
    const topics = identityToNoiseTopics(config)
    expect(topics).toContain("travel")
    expect(topics).toContain("technology")
    expect(topics).toContain("finance")
    // Bez duplikatów.
    expect(new Set(topics).size).toBe(topics.length)
  })

  it("brak zaznaczonych zainteresowań → pusta lista tematów", () => {
    expect(identityToNoiseTopics({ ...DEFAULT_IDENTITY, interests: [] })).toEqual([])
  })
})

describe("Virtual Identity Studio  -  statystyki pochodne", () => {
  it("statystyki są w zakresie 0-100", () => {
    for (const a of ARCHETYPES) {
      const stats = deriveStats(applyArchetype(a))
      for (const v of [stats.wealth, stats.tech, stats.mobility]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it("mocniejszy sprzęt podnosi technikę, podróże podnoszą mobilność", () => {
    const weak = deriveStats({ ...DEFAULT_IDENTITY, hardware: "budget", interests: [] })
    const strong = deriveStats({ ...DEFAULT_IDENTITY, hardware: "powerhouse", interests: [] })
    expect(strong.tech).toBeGreaterThan(weak.tech)

    const noTravel = deriveStats({ ...DEFAULT_IDENTITY, interests: [] })
    const travel = deriveStats({ ...DEFAULT_IDENTITY, interests: ["travel"] })
    expect(travel.mobility).toBeGreaterThan(noTravel.mobility)
  })

  it("hardwareFromIndex clampuje suwak 0-2", () => {
    expect(hardwareFromIndex(0)).toBe("budget")
    expect(hardwareFromIndex(1)).toBe("office")
    expect(hardwareFromIndex(2)).toBe("powerhouse")
    expect(hardwareFromIndex(99)).toBe("powerhouse")
    expect(hardwareFromIndex(-5)).toBe("budget")
  })
})

describe("Virtual Identity Studio  -  normalizacja storage", () => {
  it("odrzuca nieznane wartości i deduplikuje zainteresowania", () => {
    const normalized = normalizeVirtualIdentityConfig({
      archetypeId: "ghost",
      gender: "bot",
      ageBand: "ancient",
      hardware: "quantum",
      origin: "moon",
      interests: ["travel", "travel", "bogus", 42]
    })

    expect(normalized.gender).toBe(DEFAULT_IDENTITY.gender)
    expect(normalized.ageBand).toBe(DEFAULT_IDENTITY.ageBand)
    expect(normalized.hardware).toBe(DEFAULT_IDENTITY.hardware)
    expect(normalized.origin).toBe(DEFAULT_IDENTITY.origin)
    expect(normalized.interests).toEqual(["travel"])
  })
})
