import { vi } from "vitest"

import {
  canUseDebuggerTextExtraction,
  extractVisibleTextWithDebugger
} from "../src/background/aiDeepDive/debuggerTextExtraction"

describe("AI Deep-Dive debugger text extraction", () => {
  it("uses Chrome debugger Runtime.evaluate to extract visible page text", async () => {
    const calls: string[] = []
    const debuggerApi = {
      attach: vi.fn((_target, _version, callback) => {
        calls.push("attach")
        callback()
      }),
      sendCommand: vi.fn((_target, command, _params, callback) => {
        calls.push(command)
        callback({
          result: {
            type: "object",
            value: {
              title: "Chrome privacy settings",
              meta: "Privacy controls",
              headings: "Privacy and security",
              body: "Cookies, site data, permissions, and security controls."
            }
          }
        })
      }),
      detach: vi.fn((_target, callback) => {
        calls.push("detach")
        callback()
      })
    }

    const input = await extractVisibleTextWithDebugger(
      11,
      "chrome://settings/privacy?secret=value",
      debuggerApi
    )

    expect(input).toEqual({
      title: "Chrome privacy settings",
      meta: "Privacy controls",
      headings: "Privacy and security",
      body: "Cookies, site data, permissions, and security controls.",
      origin: "chrome://settings",
      path: "/privacy?secret=value"
    })
    expect(calls).toEqual(["attach", "Runtime.evaluate", "detach"])
  })

  it("detaches when Runtime.evaluate fails", async () => {
    const calls: string[] = []
    const debuggerApi = {
      attach: vi.fn((_target, _version, callback) => {
        calls.push("attach")
        callback()
      }),
      sendCommand: vi.fn((_target, command, _params, callback) => {
        calls.push(command)
        callback({ exceptionDetails: { text: "blocked" } })
      }),
      detach: vi.fn((_target, callback) => {
        calls.push("detach")
        callback()
      })
    }

    await expect(
      extractVisibleTextWithDebugger(12, "chrome://settings", debuggerApi)
    ).resolves.toBeNull()
    expect(calls).toEqual(["attach", "Runtime.evaluate", "detach"])
  })

  it("does not try debugger text extraction on ordinary web pages", () => {
    expect(canUseDebuggerTextExtraction("https://example.test/page")).toBe(false)
    expect(canUseDebuggerTextExtraction("http://example.test/page")).toBe(false)
    expect(canUseDebuggerTextExtraction("chrome://settings")).toBe(true)
    expect(canUseDebuggerTextExtraction("about:blank")).toBe(true)
  })
})
