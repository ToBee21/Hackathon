import { describe, expect, it } from "vitest"

import { requiresEncryptedStorage } from "../../src/security/storageSchema"
import { STORAGE_KEYS } from "../../src/types"
import { readRepoFile } from "./helpers"

describe("storage privacy security gate", () => {
  it("stores API tokens and generated aliases through encrypted storage", () => {
    const aliasSource = readRepoFile("src/shared/emailAlias.ts")
    const storageSource = readRepoFile("src/shared/storage.ts")

    expect(aliasSource).toContain("loadEncrypted<EmailAlias[]>(STORAGE_KEYS.EMAIL_ALIASES")
    expect(aliasSource).toContain("saveEncrypted(STORAGE_KEYS.EMAIL_ALIASES")
    expect(aliasSource).toMatch(/saveEncrypted\(STORAGE_KEYS\.API_TOKENS, tokens\)/)
    expect(aliasSource).not.toContain("[STORAGE_KEYS.EMAIL_ALIASES]: aliases")
    expect(requiresEncryptedStorage(STORAGE_KEYS.API_TOKENS)).toBe(true)
    expect(requiresEncryptedStorage(STORAGE_KEYS.EMAIL_ALIASES)).toBe(true)

    expect(storageSource).toMatch(/chrome\.storage\.session/)
    expect(storageSource).toMatch(/_internalPassphrase/)
  })

  it("documents that local logs are plaintext and therefore must never receive secrets", () => {
    const storageSource = readRepoFile("src/shared/storage.ts")

    expect(storageSource).toMatch(/chrome\.storage\.local\.set\(\{\s*\[STORAGE_KEYS\.LOG_ENTRIES\]/)
    expect(storageSource).toContain("const fullEntry: LogEntry")
  })

  it("routes the background Panic Button through the strong shared wipe", () => {
    const backgroundSource = readRepoFile("src/background.ts")
    const storageSource = readRepoFile("src/shared/storage.ts")

    expect(backgroundSource).toContain("const result = await panicButton()")
    expect(storageSource).toContain("chrome.browsingData.remove")
    expect(storageSource).toContain("chrome.storage.local.clear")
    expect(storageSource).toContain("await session?.clear()")
    expect(storageSource).toContain("_internalPassphrase = null")
  })
})
