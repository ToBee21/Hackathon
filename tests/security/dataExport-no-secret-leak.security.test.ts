import { beforeEach, describe, expect, it } from "vitest"

import {
  buildDataExport,
  redactStorageSnapshot,
  serializeDataExport
} from "../../src/shared/dataExport/buildExport"

// Every known secret value planted into the snapshot. If ANY of these strings
// survives into the serialized export, the "user owns his data" promise is
// broken and this gate must fail.
const SECRET_VALUES = [
  "SECRET_TOKEN_ABC123",
  "SECRET_KEY_XYZ",
  "SECRET_NESTED_1",
  "SECRET_NESTED_2"
] as const

function loadedSnapshot(): Record<string, unknown> {
  return {
    // EXACT secret keys that must never leak.
    "cnd:api-tokens-encrypted": "SECRET_TOKEN_ABC123",
    "cnd:crypto-session-key": "SECRET_KEY_XYZ",
    // Adversarial: secrets buried inside nested objects/arrays under a benign key.
    "cnd:module-settings": {
      creds: { apiKey: "SECRET_NESTED_1" },
      list: [{ password: "SECRET_NESTED_2" }]
    },
    // Benign data that MUST survive the redaction untouched.
    "cnd:state": { privacyScore: 42, activeAliasEmail: "alias-private@example.test" },
    "cnd:last-analysis": {
      "7": {
        page: {
          url: "https://example.test/reset?token=RAW_URL_TOKEN",
          meta: "RAW_META_SECRET",
          og: { description: "RAW_OG_SECRET" },
          headings: ["RAW_HEADING_SECRET"],
          visibleText: "RAW_VISIBLE_SECRET",
          selectedText: "RAW_SELECTION_SECRET"
        },
        cards: [{ evidence: ["RAW_EVIDENCE_SECRET"] }]
      }
    }
  }
}

describe("data export never leaks a secret (security gate)", () => {
  let snapshot: Record<string, unknown>

  beforeEach(() => {
    snapshot = loadedSnapshot()
  })

  it("serialized export contains NONE of the secret values", () => {
    const bundle = buildDataExport({
      storage: snapshot,
      now: Date.parse("2026-06-14T00:00:00.000Z"),
      appVersion: "1.0.0"
    })
    const serialized = serializeDataExport(bundle)

    for (const secret of SECRET_VALUES) {
      expect(serialized).not.toContain(secret)
    }
  })

  it("redacts the exact API-token and crypto-session secret keys", () => {
    const { redactedKeys } = redactStorageSnapshot(snapshot)

    expect(redactedKeys).toContain("cnd:api-tokens-encrypted")
    expect(redactedKeys).toContain("cnd:crypto-session-key")
  })

  it("preserves benign data (privacyScore 42) through redaction", () => {
    const { data } = redactStorageSnapshot(snapshot)

    expect(data["cnd:state"]).toEqual({
      privacyScore: 42,
      activeAliasEmail: "[redacted]"
    })
  })

  it("redacts raw page analysis and plaintext active alias state", () => {
    const { data, redactedKeys } = redactStorageSnapshot(snapshot)
    const serialized = JSON.stringify(data)

    for (const raw of [
      "alias-private@example.test",
      "RAW_URL_TOKEN",
      "RAW_META_SECRET",
      "RAW_OG_SECRET",
      "RAW_HEADING_SECRET",
      "RAW_VISIBLE_SECRET",
      "RAW_SELECTION_SECRET",
      "RAW_EVIDENCE_SECRET"
    ]) {
      expect(serialized).not.toContain(raw)
    }

    expect(redactedKeys).toContain("cnd:state.activeAliasEmail")
    expect(redactedKeys).toContain("cnd:last-analysis.7.page.visibleText")
    expect(redactedKeys).toContain("cnd:last-analysis.7.page.selectedText")
  })

  it("strips secrets nested inside objects and arrays", () => {
    const { data } = redactStorageSnapshot(snapshot)
    const serialized = JSON.stringify(data)

    // Neither the nested apiKey nor the array password value may survive.
    expect(serialized).not.toContain("SECRET_NESTED_1")
    expect(serialized).not.toContain("SECRET_NESTED_2")
  })

  it("emits the data-export schema and an ISO exportedAt timestamp", () => {
    const bundle = buildDataExport({
      storage: snapshot,
      now: Date.parse("2026-06-14T12:34:56.000Z"),
      appVersion: "1.0.0"
    })

    expect(bundle.schema).toBe("cloak-dagger/data-export")
    expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/)
    expect(new Date(bundle.exportedAt).toISOString()).toBe(bundle.exportedAt)
    // Whole serialized bundle is still secret-free end to end.
    const serialized = serializeDataExport(bundle)
    for (const secret of SECRET_VALUES) {
      expect(serialized).not.toContain(secret)
    }
  })

  it("denylist covers token/secret/password/signing/crypto/apiKey case-insensitively", () => {
    const adversarial: Record<string, unknown> = {
      "cnd:state": { privacyScore: 42 },
      Token: "leak-1",
      SECRET: "leak-2",
      Password: "leak-3",
      "request-signing": "leak-4",
      CryptoBlob: "leak-5",
      apiKey: "leak-6"
    }

    const { data, redactedKeys } = redactStorageSnapshot(adversarial)

    for (const key of ["Token", "SECRET", "Password", "request-signing", "CryptoBlob", "apiKey"]) {
      expect(redactedKeys).toContain(key)
      // The lib keeps the key but replaces its value with a redaction marker, so
      // the user can SEE a secret existed without the value ever leaking.
      expect(data[key]).toBe("[redacted]")
    }
    // Benign key is left intact.
    expect(data["cnd:state"]).toEqual({ privacyScore: 42 })
    // None of the planted leak markers survive.
    expect(JSON.stringify(data)).not.toMatch(/leak-\d/)
  })
})
