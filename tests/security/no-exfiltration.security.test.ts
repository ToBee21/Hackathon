import { describe, expect, it } from "vitest"

import { handleAiDeepDiveRiskResult } from "../../src/background/aiDeepDive/handleRiskResult"
import {
  shouldLogAiDeepDiveReport,
  shouldSendAiDeepDiveReport,
  shouldShowAiDeepDiveNotification
} from "../../src/shared/aiDeepDive/reportPolicy"
import { makeRiskResult } from "./helpers"

class FakeLocalStorageArea {
  private values: Record<string, unknown> = {}

  async get(defaults: Record<string, unknown>) {
    return { ...defaults, ...this.values }
  }

  async set(values: Record<string, unknown>) {
    Object.assign(this.values, values)
  }

  snapshot() {
    return this.values
  }
}

describe("no-exfiltration security gate", () => {
  it("denies AI Deep-Dive report emission by default", () => {
    expect(shouldSendAiDeepDiveReport(makeRiskResult({ level: "low" }))).toBe(false)
    expect(shouldSendAiDeepDiveReport(makeRiskResult({ level: "critical" }))).toBe(false)

    expect(shouldLogAiDeepDiveReport(makeRiskResult({ level: "low" }))).toBe(false)
    expect(shouldLogAiDeepDiveReport(makeRiskResult({ level: "high" }))).toBe(true)
    expect(shouldShowAiDeepDiveNotification(makeRiskResult({ level: "medium" }))).toBe(false)
    expect(shouldShowAiDeepDiveNotification(makeRiskResult({ level: "critical" }))).toBe(true)
  })

  it("persists and broadcasts a compact Deep-Dive verdict without raw text", async () => {
    const storage = new FakeLocalStorageArea()
    const messages: Array<Record<string, unknown>> = []

    const result = await handleAiDeepDiveRiskResult(makeRiskResult({ level: "high" }), {
      storage: storage as unknown as chrome.storage.LocalStorageArea,
      sendRuntimeMessage: (message) => messages.push(message),
      injectNoise: async () => undefined
    })

    expect(result.success).toBe(true)
    expect(result.maxCamo).toBe(true)

    const state = storage.snapshot()["cnd:state"] as Record<string, unknown>
    expect(state).toBeTruthy()
    const risk = state.aiDeepDiveRisk as Record<string, unknown>
    expect(risk.level).toBe("high")
    expect(risk.rawTextRetained).toBe(false)
    expect(JSON.stringify(risk)).not.toContain("rawExcerpt")
    expect(JSON.stringify(risk)).not.toContain("private model output")

    const stateUpdate = messages.find((message) => message.type === "STATE_UPDATE")
    expect(stateUpdate).toBeTruthy()
  })
})
