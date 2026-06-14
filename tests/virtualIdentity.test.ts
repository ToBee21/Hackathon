import {
  buildCustomBucket,
  buildPrivacyProfile,
  configToExtremity,
  extremityToConfig,
  getProfilePreset,
  PROFILE_PRESETS
} from "../src/shared/bionicBlurCore"
import { estimateMaskedShadow } from "../src/shared/shadowAudit"

const KNOWN_PLATFORMS = new Set(PROFILE_PRESETS.map((p) => p.bucket.platform))

describe("Virtual Identity — wybór persony", () => {
  it("wymusza bucket persony deterministycznie", () => {
    const a = buildPrivacyProfile("https://example.com", "seed-1", {
      profileId: "creative-mac"
    })
    const b = buildPrivacyProfile("https://other.test", "seed-2", {
      profileId: "creative-mac"
    })

    expect(a.platform).toBe("MacIntel")
    expect(a.webglVendor).toBe("Apple Inc.")
    // Ta sama persona → ten sam profil tożsamości niezależnie od origin/seed.
    expect(b.platform).toBe(a.platform)
    expect(b.webglRenderer).toBe(a.webglRenderer)
  })

  it("każdy preset ma id mapujące się na własny bucket", () => {
    for (const preset of PROFILE_PRESETS) {
      const profile = buildPrivacyProfile("https://x.test", "s", {
        profileId: preset.id
      })
      expect(profile.platform).toBe(preset.bucket.platform)
      expect(getProfilePreset(preset.id)?.id).toBe(preset.id)
    }
  })

  it("tryb auto dalej losuje z puli i jest deterministyczny per (origin, seed)", () => {
    const first = buildPrivacyProfile("https://example.com", "seed-A")
    const again = buildPrivacyProfile("https://example.com", "seed-A")

    expect(KNOWN_PLATFORMS.has(first.platform)).toBe(true)
    expect(again.platform).toBe(first.platform)
    expect(again.webglRenderer).toBe(first.webglRenderer)
  })

  it("custom używa przekazanego bucketa i pilnuje spójności OS↔GPU", () => {
    const linux = buildCustomBucket("linux")
    expect(linux.platform).toContain("Linux")
    expect(linux.webglRenderer.toLowerCase()).toContain("amd")

    const profile = buildPrivacyProfile("https://x.test", "s", {
      profileId: "custom",
      customBucket: linux
    })
    expect(profile.platform).toBe(linux.platform)
    expect(profile.webglRenderer).toBe(linux.webglRenderer)
  })
})

describe("Entropy Drop — estymacja maski", () => {
  it("persona ma niższą poglądową entropię niż typowy realny ślad (~30 bit)", () => {
    const masked = estimateMaskedShadow("creative-mac")
    expect(masked.mode).toBe("persona")
    expect(masked.totalBits).not.toBeNull()
    expect(masked.totalBits as number).toBeLessThan(30)
    expect(masked.totalBits as number).toBeGreaterThan(0)
  })

  it("auto nie zwraca pojedynczego śladu (rotacja)", () => {
    const masked = estimateMaskedShadow("auto")
    expect(masked.mode).toBe("auto")
    expect(masked.totalBits).toBeNull()
    expect(masked.oneInN).toBeNull()
  })

  it("rzadszy OS daje wyższą entropię maski (Windows < Linux)", () => {
    const win = estimateMaskedShadow("office-win").totalBits as number
    const linux = estimateMaskedShadow("dev-linux").totalBits as number
    expect(linux).toBeGreaterThan(win)
  })
})

describe("Suwak Intensywność maski (Extremity)", () => {
  it("mapuje 0–100 na pola maski w granicach clampów", () => {
    expect(extremityToConfig(0)).toEqual({ mouseIntensity: 0, timestampJitterMs: 0 })
    expect(extremityToConfig(100)).toEqual({
      mouseIntensity: 12,
      timestampJitterMs: 40
    })
    expect(extremityToConfig(50)).toEqual({
      mouseIntensity: 6,
      timestampJitterMs: 20
    })
  })

  it("clampuje wartości spoza zakresu", () => {
    expect(extremityToConfig(999).mouseIntensity).toBe(12)
    expect(extremityToConfig(-50).mouseIntensity).toBe(0)
  })

  it("configToExtremity jest odwrotnością na siatce myszy", () => {
    expect(configToExtremity({ mouseIntensity: 0 })).toBe(0)
    expect(configToExtremity({ mouseIntensity: 12 })).toBe(100)
    expect(configToExtremity({ mouseIntensity: 6 })).toBe(50)
  })
})
