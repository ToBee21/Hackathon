import { describe, expect, it } from "vitest"

import {
  buildDataExport,
  redactStorageSnapshot,
  serializeDataExport,
  type DataExportInput
} from "../src/shared/dataExport/buildExport"

const NOW = Date.UTC(2026, 5, 14, 12, 0, 0)

// Distinctive secret values — if any of these strings appear in the serialized
// export, redaction has failed and a credential would have leaked.
const SECRETS = {
  apiTokens: "SECRET-API-TOKENS-ZZZ111",
  cryptoSession: "SECRET-CRYPTO-KEY-ZZZ222",
  apiKey: "SECRET-NESTED-APIKEY-ZZZ333",
  token: "SECRET-NESTED-TOKEN-ZZZ444",
  password: "SECRET-NESTED-PASSWORD-ZZZ555"
}

function storageWithSecrets(): Record<string, unknown> {
  return {
    // EXACT lead-verified secret keys.
    "cnd:api-tokens-encrypted": SECRETS.apiTokens,
    "cnd:crypto-session-key": SECRETS.cryptoSession,
    // Nested object mixing secret + benign keys.
    "cnd:module-settings": {
      apiKey: SECRETS.apiKey,
      token: SECRETS.token,
      password: SECRETS.password,
      normalField: "keep-me-normal"
    },
    // Benign top-level data the user owns → must survive untouched.
    "cnd:state": { enabled: true, mode: "stealth" },
    // Email aliases ARE the user's own data → must be KEPT.
    "cnd:email-aliases": ["alias1@cloak.example", "alias2@cloak.example"]
  }
}

function input(): DataExportInput {
  return {
    storage: storageWithSecrets(),
    now: NOW,
    appVersion: "1.0.0"
  }
}

describe("redactStorageSnapshot — secret removal", () => {
  it("replaces secret values with the literal [redacted] marker", () => {
    const { data } = redactStorageSnapshot(storageWithSecrets())
    expect(data["cnd:api-tokens-encrypted"]).toBe("[redacted]")
    expect(data["cnd:crypto-session-key"]).toBe("[redacted]")
    const mod = data["cnd:module-settings"] as Record<string, unknown>
    expect(mod.apiKey).toBe("[redacted]")
    expect(mod.token).toBe("[redacted]")
    expect(mod.password).toBe("[redacted]")
  })

  it("records the redacted key paths (top-level and nested)", () => {
    const { redactedKeys } = redactStorageSnapshot(storageWithSecrets())
    expect(redactedKeys).toContain("cnd:api-tokens-encrypted")
    expect(redactedKeys).toContain("cnd:crypto-session-key")
    expect(redactedKeys).toContain("cnd:module-settings.apiKey")
    expect(redactedKeys).toContain("cnd:module-settings.token")
    expect(redactedKeys).toContain("cnd:module-settings.password")
  })

  it("keeps benign data — including nested normalField — untouched", () => {
    const { data } = redactStorageSnapshot(storageWithSecrets())
    expect(data["cnd:state"]).toEqual({ enabled: true, mode: "stealth" })
    const mod = data["cnd:module-settings"] as Record<string, unknown>
    expect(mod.normalField).toBe("keep-me-normal")
  })

  it("keeps email aliases — the user owns them", () => {
    const { data, redactedKeys } = redactStorageSnapshot(storageWithSecrets())
    expect(data["cnd:email-aliases"]).toEqual([
      "alias1@cloak.example",
      "alias2@cloak.example"
    ])
    expect(redactedKeys).not.toContain("cnd:email-aliases")
  })

  it("does not mutate the input snapshot", () => {
    const raw = storageWithSecrets()
    redactStorageSnapshot(raw)
    expect(raw["cnd:api-tokens-encrypted"]).toBe(SECRETS.apiTokens)
    expect((raw["cnd:module-settings"] as Record<string, unknown>).apiKey).toBe(
      SECRETS.apiKey
    )
  })
})

describe("serialized export never leaks a secret value", () => {
  it("contains no secret value anywhere in the JSON string", () => {
    const json = serializeDataExport(buildDataExport(input()))
    for (const value of Object.values(SECRETS)) {
      expect(json.includes(value)).toBe(false)
    }
  })

  it("still contains the user's own benign data and aliases", () => {
    const json = serializeDataExport(buildDataExport(input()))
    expect(json).toContain("keep-me-normal")
    expect(json).toContain("stealth")
    expect(json).toContain("alias1@cloak.example")
    expect(json).toContain("[redacted]")
  })

  it("surfaces the redacted key paths on the bundle", () => {
    const bundle = buildDataExport(input())
    expect(bundle.redactedKeys).toEqual(
      expect.arrayContaining([
        "cnd:api-tokens-encrypted",
        "cnd:crypto-session-key",
        "cnd:module-settings.apiKey",
        "cnd:module-settings.token",
        "cnd:module-settings.password"
      ])
    )
    expect(bundle.redactedKeys).not.toContain("cnd:email-aliases")
    expect(bundle.redactedKeys).not.toContain("cnd:state")
  })
})
