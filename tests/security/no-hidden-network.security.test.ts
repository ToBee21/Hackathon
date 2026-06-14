import { describe, expect, it } from "vitest"

import { NETWORK_POLICY } from "../../src/security/networkPolicy"
import {
  readBuiltBackgroundScript,
  readBuiltOffscreenScript,
  readRepoFile
} from "./helpers"

describe("no-hidden-network security gate", () => {
  it("keeps external integrations explicit and removes bundled credentials", () => {
    const aliasSource = readRepoFile("src/shared/emailAlias.ts")
    const backgroundSource = readRepoFile("src/background.ts")
    const builtBackground = readBuiltBackgroundScript()

    expect(aliasSource).toContain("https://app.simplelogin.io/api")
    expect(builtBackground).toContain("https://app.simplelogin.io/api")
    expect(NETWORK_POLICY.explicitUserActionEndpoints).toContain(
      "https://app.simplelogin.io/api/alias/random/new"
    )
    expect(backgroundSource).not.toContain("saveApiToken(\"simplelogin\"")
    expect(builtBackground).not.toContain("bkfwey")
  })

  it("disables silent remote model downloads in app runtime code", () => {
    const source = readRepoFile("src/shared/aiDeepDive/localNli.ts")
    const builtOffscreen = readBuiltOffscreenScript()

    expect(source).toMatch(/allowRemoteModels\s*=\s*false/)
    expect(builtOffscreen).toContain("env.allowRemoteModels = false")
    expect(builtOffscreen).not.toContain("env.allowRemoteModels = true")
  })

  it("does not contact real third-party analytics endpoints in demo self-tests", () => {
    const honeypot = readRepoFile("src/shared/honeypot.ts")
    const background = readRepoFile("src/background.ts")

    expect(honeypot).not.toContain("https://www.google-analytics.com/g/collect")
    expect(honeypot).toContain("mock://local-honeypot-self-test")
    expect(background).not.toContain("api/rest_v1/page/random/title")
    expect(background).toContain("isNoiseEnabled: false")
    expect(NETWORK_POLICY.defaultNetworkSilent).toBe(true)
  })
})
