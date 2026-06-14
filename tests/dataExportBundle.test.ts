import { describe, expect, it } from "vitest"

import {
  buildDataExport,
  serializeDataExport,
  type DataExportInput
} from "../src/shared/dataExport/buildExport"

// Fixed clock → deterministic exportedAt.
const NOW = Date.UTC(2026, 5, 14, 12, 0, 0) // 2026-06-14T12:00:00.000Z

function baseInput(overrides: Partial<DataExportInput> = {}): DataExportInput {
  return {
    storage: { "cnd:state": { enabled: true } },
    now: NOW,
    appVersion: "1.2.3",
    ...overrides
  }
}

describe("buildDataExport — bundle shape", () => {
  it("has the contract schema / version / app fields", () => {
    const bundle = buildDataExport(baseInput())
    expect(bundle.schema).toBe("cloak-dagger/data-export")
    expect(bundle.schemaVersion).toBe(1)
    expect(bundle.app).toBe("Cloak & Dagger")
    expect(bundle.appVersion).toBe("1.2.3")
  })

  it("derives exportedAt as an ISO string from input.now", () => {
    const bundle = buildDataExport(baseInput())
    expect(bundle.exportedAt).toBe("2026-06-14T12:00:00.000Z")
    expect(bundle.exportedAt).toBe(new Date(NOW).toISOString())
    // ISO-8601 with trailing Z
    expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it("always carries storage and a redactedKeys array", () => {
    const bundle = buildDataExport(baseInput())
    expect(bundle.storage).toEqual({ "cnd:state": { enabled: true } })
    expect(Array.isArray(bundle.redactedKeys)).toBe(true)
  })

  it("includes shadowAudit and dataFootprint when provided", () => {
    const shadowAudit = { totalBits: 21.5, rarity: "high" }
    const dataFootprint = { score: 70, level: "high" }
    const bundle = buildDataExport(baseInput({ shadowAudit, dataFootprint }))
    expect(bundle.shadowAudit).toEqual(shadowAudit)
    expect(bundle.dataFootprint).toEqual(dataFootprint)
  })

  it("omits optional sections entirely when not provided", () => {
    const bundle = buildDataExport(baseInput())
    expect("shadowAudit" in bundle).toBe(false)
    expect("dataFootprint" in bundle).toBe(false)
    expect("browser" in bundle).toBe(false)
  })

  it("includes the browser block when provided", () => {
    const browser = { userAgent: "Mozilla/5.0", language: "pl-PL", platform: "Win32" }
    const bundle = buildDataExport(baseInput({ browser }))
    expect(bundle.browser).toEqual(browser)
  })
})

describe("serializeDataExport", () => {
  it("produces pretty (2-space indented) JSON", () => {
    const json = serializeDataExport(buildDataExport(baseInput()))
    expect(json).toContain('\n  "schema"')
  })

  it("round-trips via JSON.parse", () => {
    const bundle = buildDataExport(
      baseInput({ shadowAudit: { totalBits: 12 }, dataFootprint: { score: 0 } })
    )
    const parsed = JSON.parse(serializeDataExport(bundle))
    expect(parsed).toEqual(bundle)
  })

  it("is deterministic for a fixed now", () => {
    const a = serializeDataExport(buildDataExport(baseInput()))
    const b = serializeDataExport(buildDataExport(baseInput()))
    expect(a).toBe(b)
  })
})
