import {
  computeCampaignFingerprint,
  recordCampaign,
  getCampaign,
  isRepeatOffender,
  resetCampaigns
} from "../src/shared/mailGuard/campaignFingerprint"
import type { FingerprintInput } from "../src/shared/mailGuard/types"

const baseInput: FingerprintInput = {
  senderDomainPattern: "paypa1-secure.tk",
  targetBrand: "paypal",
  linkDomainPattern: "*-login.tk",
  attachmentArchetype: "none",
  moArchetype: "credential-phishing"
}

beforeEach(() => {
  resetCampaigns()
})

describe("computeCampaignFingerprint", () => {
  it("is deterministic: same input → same fingerprint", () => {
    const a = computeCampaignFingerprint(baseInput)
    const b = computeCampaignFingerprint({ ...baseInput })
    expect(a).toBe(b)
  })

  it("uses the cmp_ prefix and 8 hex chars", () => {
    expect(computeCampaignFingerprint(baseInput)).toMatch(/^cmp_[0-9a-f]{8}$/)
  })

  it("different input → different fingerprint", () => {
    const a = computeCampaignFingerprint(baseInput)
    const b = computeCampaignFingerprint({ ...baseInput, moArchetype: "bec" })
    expect(a).not.toBe(b)
  })

  it("normalizes case and surrounding whitespace", () => {
    const a = computeCampaignFingerprint(baseInput)
    const b = computeCampaignFingerprint({
      ...baseInput,
      senderDomainPattern: "  PAYPA1-SECURE.TK  ",
      targetBrand: "PayPal"
    })
    expect(a).toBe(b)
  })

  it("handles null fields (null → \"\")", () => {
    const withNulls: FingerprintInput = {
      ...baseInput,
      targetBrand: null,
      linkDomainPattern: null
    }
    const fp = computeCampaignFingerprint(withNulls)
    expect(fp).toMatch(/^cmp_[0-9a-f]{8}$/)
    // null target/link must equal explicit empty strings
    const withEmpties = computeCampaignFingerprint({
      ...baseInput,
      targetBrand: "",
      linkDomainPattern: ""
    } as FingerprintInput)
    expect(fp).toBe(withEmpties)
  })

  it("distinguishes fields even when concatenation could collide", () => {
    const a = computeCampaignFingerprint({
      ...baseInput,
      senderDomainPattern: "ab",
      targetBrand: "c"
    })
    const b = computeCampaignFingerprint({
      ...baseInput,
      senderDomainPattern: "a",
      targetBrand: "bc"
    })
    expect(a).not.toBe(b)
  })
})

describe("campaign tracker", () => {
  it("recordCampaign creates a record on first sighting", () => {
    const fp = computeCampaignFingerprint(baseInput)
    const rec = recordCampaign(fp, 1000)
    expect(rec).toEqual({
      fingerprint: fp,
      firstSeen: 1000,
      lastSeen: 1000,
      count: 1
    })
  })

  it("recordCampaign increments count and updates lastSeen but keeps firstSeen", () => {
    const fp = computeCampaignFingerprint(baseInput)
    recordCampaign(fp, 1000)
    const rec = recordCampaign(fp, 5000)
    expect(rec.firstSeen).toBe(1000)
    expect(rec.lastSeen).toBe(5000)
    expect(rec.count).toBe(2)
  })

  it("getCampaign returns the record or null", () => {
    const fp = computeCampaignFingerprint(baseInput)
    expect(getCampaign(fp)).toBeNull()
    recordCampaign(fp, 1000)
    expect(getCampaign(fp)?.count).toBe(1)
  })

  it("isRepeatOffender flips true on 2nd sighting", () => {
    const fp = computeCampaignFingerprint(baseInput)
    expect(isRepeatOffender(fp)).toBe(false)
    recordCampaign(fp, 1000)
    expect(isRepeatOffender(fp)).toBe(false)
    recordCampaign(fp, 2000)
    expect(isRepeatOffender(fp)).toBe(true)
  })

  it("tracks distinct fingerprints independently", () => {
    const fpA = computeCampaignFingerprint(baseInput)
    const fpB = computeCampaignFingerprint({ ...baseInput, moArchetype: "bec" })
    recordCampaign(fpA, 100)
    recordCampaign(fpA, 200)
    recordCampaign(fpB, 300)
    expect(isRepeatOffender(fpA)).toBe(true)
    expect(isRepeatOffender(fpB)).toBe(false)
  })

  it("resetCampaigns clears the map", () => {
    const fp = computeCampaignFingerprint(baseInput)
    recordCampaign(fp, 1000)
    recordCampaign(fp, 2000)
    resetCampaigns()
    expect(getCampaign(fp)).toBeNull()
    expect(isRepeatOffender(fp)).toBe(false)
  })
})
