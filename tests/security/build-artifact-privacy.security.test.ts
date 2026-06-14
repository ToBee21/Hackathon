import { describe, expect, it } from "vitest"

import {
  readBuiltBackgroundScript,
  readBuiltContentScript,
  readBuiltManifest,
  readBuiltOffscreenScript
} from "./helpers"

describe("build artifact privacy security gate", () => {
  it("ships without plaintext alias logs, bundled tokens, real GA self-tests, or remote model default", () => {
    const content = readBuiltContentScript()
    const background = readBuiltBackgroundScript()
    const offscreen = readBuiltOffscreenScript()

    expect(content).toContain("Email alias: wygenerowano")
    expect(content).not.toContain("Email alias: wygenerowano ${")
    expect(content).toContain('"BIONIC_BLUR_CONFIG"')
    expect(background).toContain("https://app.simplelogin.io/api")
    expect(background).not.toContain("bkfwey")
    expect(background).not.toContain("https://www.google-analytics.com/g/collect")
    expect(offscreen).toContain("env.allowRemoteModels = false")
    expect(offscreen).not.toContain("env.allowRemoteModels = true")
  })

  it("ships without blanket all-urls host access", () => {
    const manifest = readBuiltManifest()

    expect(manifest.host_permissions).not.toContain("<all_urls>")
  })
})
