import { describe, expect, it } from "vitest"

import { CND_MESSAGE_TYPES } from "../../src/security/validateMessage"
import { isCndMessage } from "../../src/shared/messages"
import { readRepoFile } from "./helpers"

const validInput = {
  title: "t",
  meta: "m",
  headings: "h",
  body: "body",
  origin: "https://example.test",
  path: "/article"
}

const validConfig = {
  aiModeEnabled: true,
  selectedModelId: "nli-deberta-small",
  nliMinHeuristicScore: 25,
  maxSnippetChars: 2500
}

describe("message boundary security gate", () => {
  it("rejects unknown CND_* messages instead of trusting a prefix", () => {
    expect(isCndMessage({ type: "CND_EVIL" })).toBe(false)
    expect(isCndMessage({ type: "NOT_CND" })).toBe(false)
    expect(isCndMessage({ type: 123 })).toBe(false)
    expect(CND_MESSAGE_TYPES).not.toContain("CND_EVIL")

    const source = readRepoFile("src/shared/messages.ts")
    expect(source).not.toContain("type.startsWith")
  })

  it("accepts only known messages with bounded payload schemas", () => {
    expect(
      isCndMessage({ type: "CND_DEEP_SCAN", input: validInput, config: validConfig })
    ).toBe(true)

    expect(
      isCndMessage({
        type: "CND_DEEP_SCAN",
        input: { ...validInput, body: "x".repeat(20_000) },
        config: validConfig
      })
    ).toBe(false)

    expect(
      isCndMessage({
        type: "CND_OFFSCREEN_LOG",
        entry: {
          ts: Date.now(),
          level: "info",
          stage: "generated",
          elapsedMs: 12,
          rawText: "model output must not cross this boundary"
        }
      })
    ).toBe(false)
  })
})
