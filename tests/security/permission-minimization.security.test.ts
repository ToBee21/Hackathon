import { describe, expect, it } from "vitest"

import { readBuiltManifest } from "./helpers"

describe("permission minimization security gate", () => {
  it("does not request the blanket <all_urls> host permission", () => {
    const manifest = readBuiltManifest()

    expect(manifest.host_permissions).not.toContain("<all_urls>")
    expect(manifest.host_permissions).toEqual(["http://*/*", "https://*/*"])
    expect(manifest.permissions).toEqual(
      expect.arrayContaining([
        "storage",
        "browsingData",
        "cookies",
        "tabs",
        "debugger",
        "scripting",
        "privacy",
        "declarativeNetRequest",
        "offscreen"
      ])
    )
  })

  it("keeps web-accessible resources off <all_urls> and confines CSP to extension scripts/WASM", () => {
    const manifest = readBuiltManifest()
    const war = JSON.stringify(manifest.web_accessible_resources ?? [])

    expect(manifest.content_security_policy?.extension_pages).toContain("'wasm-unsafe-eval'")
    expect(war).not.toContain("<all_urls>")
    expect(war).toContain("assets/onnxruntime/*")
    expect(war).toContain("assets/offscreen/*")
    expect(war).toContain("assets/vendor/*")
  })
})
