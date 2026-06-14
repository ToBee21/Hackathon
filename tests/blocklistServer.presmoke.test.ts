// Presmoke: the REAL client update path against the running local CDN
// (server/compose.local.yml on 127.0.0.1:8899). Skips gracefully if the
// container is not up, so it never breaks CI; run it after `docker compose -f
// server/compose.local.yml up -d`.

import { beforeAll, describe, expect, it } from "vitest"

import { BASELINE_BUNDLE } from "../src/shared/blocklist/baselineBundle"
import { vetSignedUpdate } from "../src/shared/blocklist/secureUpdater"
import type { SignedBlocklistBundle } from "../src/shared/blocklist/types"

const BASE = process.env.BLOCKLIST_CDN || "http://127.0.0.1:8899"

let serverUp = false
let signed: SignedBlocklistBundle | null = null

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE}/bundle.signed.json`, { cache: "no-store" })
    if (res.ok) {
      signed = (await res.json()) as SignedBlocklistBundle
      serverUp = true
    }
  } catch {
    serverUp = false
  }
})

describe("blocklist CDN presmoke (live signed-update path)", () => {
  it("client ACCEPTS the genuine signed bundle served by the CDN", async () => {
    if (!serverUp || !signed) {
      console.warn("CDN not reachable on", BASE, "- skipping presmoke")
      return
    }
    // Mirrors the real client path: the baked baseline is the full compiled
    // list, so runBlocklistUpdate()'s readCurrentBundle() reports isSeed:false
    // and the ratio anomaly gate (not the seed bypass) vets the refresh.
    const decision = await vetSignedUpdate(BASELINE_BUNDLE, signed, {
      currentIsSeed: false
    })
    expect(decision.accept).toBe(true)
    expect(decision.bundle?.version).toBeGreaterThan(BASELINE_BUNDLE.version)
  })

  it("REJECTS a tampered signature (server compromise without the key)", async () => {
    if (!serverUp || !signed) return
    const flipped = signed.signature.startsWith("A") ? "B" : "A"
    const tampered: SignedBlocklistBundle = {
      ...signed,
      signature: flipped + signed.signature.slice(1)
    }
    const decision = await vetSignedUpdate(BASELINE_BUNDLE, tampered, {
      currentIsSeed: true
    })
    expect(decision.accept).toBe(false)
    expect(decision.reason).toBe("bad-signature")
  })

  it("REJECTS a tampered bundle body (signature no longer matches)", async () => {
    if (!serverUp || !signed) return
    const poisoned: SignedBlocklistBundle = {
      bundle: {
        ...signed.bundle,
        entries: [
          ...signed.bundle.entries,
          {
            domain: "attacker-injected.example",
            source: "manual",
            category: "tracker",
            tier: "baseline"
          }
        ]
      },
      signature: signed.signature
    }
    const decision = await vetSignedUpdate(BASELINE_BUNDLE, poisoned, {
      currentIsSeed: true
    })
    expect(decision.accept).toBe(false)
    expect(decision.reason).toBe("bad-signature")
  })

  it("REJECTS a rollback even with a valid signature", async () => {
    if (!serverUp || !signed) return
    const newerCurrent = { ...BASELINE_BUNDLE, version: 999 }
    const decision = await vetSignedUpdate(newerCurrent, signed)
    expect(decision.accept).toBe(false)
    expect(decision.reason).toBe("not-newer")
  })
})
