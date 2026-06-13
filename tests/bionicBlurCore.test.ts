import {
  buildPrivacyProfile,
  clampNumber,
  createSeededRandom,
  getBlurredPointerFields,
  getCoarseTimestamp
} from "../src/shared/bionicBlurCore"

describe("bionic blur core", () => {
  it("uses deterministic random values for the same seed", () => {
    const first = createSeededRandom("origin-a")
    const second = createSeededRandom("origin-a")

    expect([first(), first(), first()]).toEqual([second(), second(), second()])
  })

  it("keeps pointer jitter bounded and correlated across coordinate fields", () => {
    const profile = buildPrivacyProfile("https://example.test", 1720000000000)
    const blurred = getBlurredPointerFields(
      {
        clientX: 100,
        clientY: 200,
        pageX: 110,
        pageY: 230,
        screenX: 300,
        screenY: 400,
        movementX: 4,
        movementY: -2
      },
      profile,
      {
        mouseIntensity: 3,
        timestampJitterMs: 12
      }
    )

    const dx = blurred.clientX - 100
    const dy = blurred.clientY - 200

    expect(Math.abs(dx)).toBeLessThanOrEqual(3)
    expect(Math.abs(dy)).toBeLessThanOrEqual(3)
    expect(blurred.pageX).toBeCloseTo(110 + dx)
    expect(blurred.pageY).toBeCloseTo(230 + dy)
    expect(blurred.screenX).toBeCloseTo(300 + dx)
    expect(blurred.screenY).toBeCloseTo(400 + dy)
    expect(Math.abs(blurred.movementX - 4)).toBeLessThanOrEqual(3)
    expect(Math.abs(blurred.movementY + 2)).toBeLessThanOrEqual(3)
  })

  it("stabilizes the generated privacy profile per origin bucket", () => {
    const first = buildPrivacyProfile("https://example.test/path", 1720000000000)
    const second = buildPrivacyProfile("https://example.test/other", 1720000000000)

    expect(first).toEqual(second)
    expect(first.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
    expect(first.timezone).toContain("/")
    expect(first.screen.width).toBeGreaterThan(0)
    expect(first.hardwareConcurrency).toBeGreaterThan(0)
  })

  it("coarsens timestamps without producing random per-call chaos", () => {
    const profile = buildPrivacyProfile("https://example.test", 1720000000000)
    const first = getCoarseTimestamp(1234.56, profile, 12)
    const second = getCoarseTimestamp(1234.56, profile, 12)

    expect(first).toBe(second)
    expect(Math.abs(first - 1234.56)).toBeLessThanOrEqual(12)
  })

  it("clamps numeric values inside configured bounds", () => {
    expect(clampNumber(25, 0, 10)).toBe(10)
    expect(clampNumber(-5, 0, 10)).toBe(0)
    expect(clampNumber(7, 0, 10)).toBe(7)
  })
})
