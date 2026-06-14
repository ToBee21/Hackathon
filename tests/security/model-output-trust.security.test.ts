import { describe, expect, it } from "vitest"

import { handleAiDeepDiveRiskResult } from "../../src/background/aiDeepDive/handleRiskResult"
import { buildLlmMessages } from "../../src/shared/aiDeepDive/localLlm"
import { makeRiskResult, readRepoFile } from "./helpers"

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

describe("model-output trust security gate", () => {
  it("wraps prompt injection text as untrusted DATA in the local LLM prompt", () => {
    const hostileFixture = readRepoFile("tests/fixtures/privacy-hostile/prompt-injection.html")
    const messages = buildLlmMessages(hostileFixture)

    expect(messages[0].content).toMatch(/untrusted DATA/i)
    expect(messages[1].content).toContain(hostileFixture)
  })

  it("drops untrusted incoming model metadata instead of fabricating local-only claims", async () => {
    const storage = new FakeLocalStorageArea()

    await handleAiDeepDiveRiskResult(
      makeRiskResult({
        model: {
          mode: "heuristic+nli",
          id: "remote-model",
          localOnly: false
        } as any
      }) as any,
      {
        storage: storage as unknown as chrome.storage.LocalStorageArea,
        sendRuntimeMessage: () => undefined,
        injectNoise: async () => undefined
      }
    )

    const state = storage.snapshot()["cnd:state"] as Record<string, unknown>
    const storedRisk = state.aiDeepDiveRisk as Record<string, unknown>

    expect(storedRisk.model).toBeUndefined()
    expect(storedRisk.rawTextRetained).toBe(false)
  })
})
