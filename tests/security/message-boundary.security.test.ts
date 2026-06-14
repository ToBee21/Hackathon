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

const onePixelPngDataUrl =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="

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

  it("accepts vision inference only for bounded PNG data URLs", () => {
    expect(
      isCndMessage({
        type: "CND_VISION_INFER",
        requestId: "vision-1",
        image: onePixelPngDataUrl
      })
    ).toBe(true)

    expect(
      isCndMessage({ type: "CND_VISION_INFER", image: "not-a-data-url" })
    ).toBe(false)

    expect(
      isCndMessage({
        type: "CND_VISION_INFER",
        image: "data:image/svg+xml;base64,PHN2Zy8+"
      })
    ).toBe(false)

    expect(
      isCndMessage({
        type: "CND_VISION_INFER",
        image: "data:image/png;base64,AAAA$AAA"
      })
    ).toBe(false)
  })

  it("keeps the offscreen vision listener behind its own payload gate", () => {
    const source = readRepoFile("assets/offscreen/offscreen.js")
    expect(source).toContain("isValidVisionInferMessage(message)")
    expect(source).toContain("isVisionPngDataUrl(message.image)")
    expect(source).toContain("invalid vision infer message")
    expect(source).not.toContain("classifyImageAd(String(message.image ?? \"\"))")
  })
})
