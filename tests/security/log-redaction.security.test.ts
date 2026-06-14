import { describe, expect, it } from "vitest"

import { sanitizeLogMessage, sanitizeOffscreenLogEntry } from "../../src/security/privacyGuards"
import { readBuiltContentScript, readRepoFile } from "./helpers"

describe("log redaction security gate", () => {
  it("does not log alias values in source or shipped content code", () => {
    const source = readRepoFile("src/content.ts")
    const dashboard = readRepoFile("src/tabs/dashboard.tsx")
    const built = readBuiltContentScript()

    expect(source).not.toContain("Email alias: wygenerowano ${alias.alias}")
    expect(source).toContain("Email alias: wygenerowano i wstawiono do pola")
    expect(dashboard).not.toContain("Wygenerowano alias e-mail: ${alias.alias}")
    expect(dashboard).toContain("Wygenerowano alias e-mail: [redacted]")
    expect(built).toContain("Email alias: wygenerowano")
    expect(built).not.toContain("wygenerowano ${")
  })

  it("redacts emails/tokens and drops raw model fields from runtime logs", () => {
    expect(sanitizeLogMessage("alias john.doe@example.com token abcdefghijklmnopqrstuvwxyz")).toBe(
      "alias [redacted-email] token [redacted-token]"
    )

    const sanitized = sanitizeOffscreenLogEntry({
      ts: 1,
      level: "info",
      stage: "generated",
      elapsedMs: 9,
      rawText: "private model output",
      jsonText: "{secret:true}",
      error: "Raw excerpt: john@example.com abcdefghijklmnopqrstuvwxyz"
    })

    expect(JSON.stringify(sanitized)).not.toContain("private model output")
    expect(JSON.stringify(sanitized)).not.toContain("john@example.com")
    expect(sanitized.redactedFields).toEqual(["jsonText", "rawText"])
  })

  it("allows bounded diagnostic counters without exposing raw model output", () => {
    const sanitized = sanitizeOffscreenLogEntry({
      ts: 1,
      level: "info",
      stage: "generated",
      elapsedMs: 4,
      outputChars: 1234
    })

    expect(sanitized.outputChars).toBe(1234)
    expect(JSON.stringify(sanitized)).not.toContain("streamText")
    expect(JSON.stringify(sanitized)).not.toContain("jsonText")
  })

  it("keeps AI Deep-Dive report logs compact summaries rather than raw page text", () => {
    const source = readRepoFile("src/background/aiDeepDive/handleRiskResult.ts")

    expect(source).toContain("AI Deep-Dive: ${result.level} risk")
    expect(source).not.toContain("rawExcerpt")
  })
})
