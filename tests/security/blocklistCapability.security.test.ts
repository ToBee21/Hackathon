import { describe, expect, it } from "vitest"

import { isAllowlisted } from "../../src/shared/blocklist/allowlist"
import {
  MAX_BUNDLE_ENTRIES,
  canonicalizeBundle,
  sanitizeBundle
} from "../../src/shared/blocklist/bundleSchema"
import {
  SEED_FIRST_UPDATE_MAX,
  evaluateUpdate,
  vetSignedUpdate
} from "../../src/shared/blocklist/secureUpdater"
import type {
  BlocklistBundle,
  BlocklistEntry,
  SignedBlocklistBundle
} from "../../src/shared/blocklist/types"
import { readRepoFile } from "./helpers"

const okEntry: BlocklistEntry = {
  domain: "tracker.example.com",
  source: "easyprivacy",
  category: "tracker",
  tier: "baseline"
}

function bundle(version: number, entries: unknown[]): unknown {
  return { schema: 1, version, generatedAt: 0, entries }
}

describe("blocklist capability constraint (adversary-resistant input)", () => {
  it("strips any smuggled action/redirect/regex fields — only domain rules survive", () => {
    const hostile = bundle(2, [
      {
        ...okEntry,
        // A poisoned feed tries to express more than 'block this domain'.
        action: "allow",
        redirect: "https://evil.example/steal",
        regexFilter: ".*",
        allow: true
      }
    ])
    const { bundle: clean } = sanitizeBundle(hostile)
    expect(clean.entries).toHaveLength(1)
    // The sanitized entry has ONLY the four allowed keys.
    expect(Object.keys(clean.entries[0]).sort()).toEqual([
      "category",
      "domain",
      "source",
      "tier"
    ])
  })

  it("drops malformed domains, wildcards, schemes, and over-broad patterns", () => {
    const { bundle: clean, dropped } = sanitizeBundle(
      bundle(2, [
        okEntry,
        { ...okEntry, domain: "*.example.com" },
        { ...okEntry, domain: "https://example.com/path" },
        { ...okEntry, domain: "has space.com" },
        { ...okEntry, domain: "" }
      ])
    )
    expect(clean.entries).toHaveLength(1)
    expect(dropped.malformedDomain).toBe(4)
  })

  it("rejects entries with unknown source/category/tier enums", () => {
    const { bundle: clean, dropped } = sanitizeBundle(
      bundle(2, [
        okEntry,
        { ...okEntry, source: "attacker-feed" },
        { ...okEntry, tier: "godmode" }
      ])
    )
    expect(clean.entries).toHaveLength(1)
    expect(dropped.unknownEnum).toBe(2)
  })

  it("never blocks allowlisted critical infrastructure", () => {
    expect(isAllowlisted("hubertjaniak.pl")).toBe(true)
    expect(isAllowlisted("paypal.com")).toBe(true)
    expect(isAllowlisted("urzad.gov.pl")).toBe(true)
    expect(isAllowlisted("tracker.example.com")).toBe(false)

    const { bundle: clean, dropped } = sanitizeBundle(
      bundle(2, [okEntry, { ...okEntry, domain: "paypal.com" }])
    )
    expect(clean.entries.map((e) => e.domain)).toEqual(["tracker.example.com"])
    expect(dropped.allowlisted).toBe(1)
  })

  it("deduplicates and caps total entries", () => {
    const many = Array.from({ length: MAX_BUNDLE_ENTRIES + 50 }, (_, i) => ({
      ...okEntry,
      domain: `t${i}.example.com`
    }))
    const dupes = bundle(2, [okEntry, okEntry, ...many])
    const { bundle: clean, dropped } = sanitizeBundle(dupes)
    expect(clean.entries.length).toBeLessThanOrEqual(MAX_BUNDLE_ENTRIES)
    expect(dropped.duplicate).toBeGreaterThanOrEqual(1)
    expect(dropped.overflow).toBeGreaterThanOrEqual(1)
  })
})

describe("blocklist build and runtime hardening gates", () => {
  it("installs every escalated blocklist chunk per origin", () => {
    const source = readRepoFile("src/shared/blocklist/riskAdaptiveBlocking.ts")

    expect(source).toContain("MAX_ESCALATION_RULES_PER_ORIGIN")
    expect(source).toContain("index * MAX_ESCALATION_RULES_PER_ORIGIN")
    expect(source).toContain("rules.push(...built.slice(0, MAX_ESCALATION_RULES_PER_ORIGIN))")
    expect(source).not.toContain("if (built[0]) rules.push(built[0])")
  })

  it("fails closed on feed errors and applies the never-block allowlist during compile", () => {
    const source = readRepoFile("scripts/compile-blocklists.mjs")

    expect(source).toContain("const ALLOWLIST_TS")
    expect(source).toContain("function isAllowlisted(domain)")
    expect(source).toContain("if (isAllowlisted(domain)) continue")
    expect(source).toContain("process.argv.includes(\"--allow-partial\")")
    expect(source).toContain("refusing partial baseline")
  })

  it("never prints a private signing key in legacy compiler keygen", () => {
    const source = readRepoFile("scripts/compile-blocklists.mjs")

    expect(source).toContain("Private PEM is never printed to stdout.")
    expect(source).toContain("writeFileSync(PRIVATE_KEY_PATH, privPem")
    expect(source).not.toContain("console.log(privPem)")
  })

  it("signing builder reads private keys from files instead of PEM environment values", () => {
    const builder = readRepoFile("server/build-bundle.mjs")
    const compiler = readRepoFile("scripts/compile-blocklists.mjs")
    const signFile = readRepoFile("server/sign-file.mjs")
    const dockerfile = readRepoFile("server/Dockerfile.builder")
    const readme = readRepoFile("server/README.md")

    expect(builder).toContain("BLOCKLIST_PRIVATE_KEY_FILE")
    expect(builder).toContain("/run/secrets/blocklist_private_key")
    expect(builder).not.toContain("process.env.BLOCKLIST_PRIVATE_KEY_PEM")
    expect(compiler).toContain("BLOCKLIST_PRIVATE_KEY_FILE")
    expect(compiler).not.toContain("process.env.BLOCKLIST_PRIVATE_KEY_PEM")
    expect(signFile).toContain("BLOCKLIST_PRIVATE_KEY_FILE")
    expect(signFile).toContain("/run/secrets/blocklist_private_key")
    expect(signFile).not.toContain("process.env.BLOCKLIST_PRIVATE_KEY_PEM")
    expect(dockerfile).toContain("target=/run/secrets/blocklist_private_key")
    expect(dockerfile).not.toContain("BLOCKLIST_PRIVATE_KEY_PEM")
    expect(readme).toContain("BLOCKLIST_PRIVATE_KEY_FILE")
    expect(readme).not.toContain("BLOCKLIST_PRIVATE_KEY_PEM")
  })
})

describe("blocklist secure updater (rollback + anomaly gate)", () => {
  const current: BlocklistBundle = {
    schema: 1,
    version: 5,
    generatedAt: 0,
    entries: Array.from({ length: 100 }, (_, i) => ({
      domain: `d${i}.example.com`,
      source: "easyprivacy",
      category: "tracker",
      tier: "baseline"
    }))
  }

  it("rejects a rollback to an older or equal version", () => {
    expect(evaluateUpdate(current, bundle(5, [okEntry])).reason).toBe("not-newer")
    expect(evaluateUpdate(current, bundle(4, [okEntry])).reason).toBe("not-newer")
  })

  it("rejects an implausible >90% shrink or >8x explosion", () => {
    const shrink = bundle(6, [okEntry]) // 1 vs 100 = 99% shrink
    expect(evaluateUpdate(current, shrink).reason).toBe("size-anomaly")

    const explosion = bundle(
      6,
      Array.from({ length: 1000 }, (_, i) => ({
        ...okEntry,
        domain: `x${i}.example.com`
      }))
    )
    expect(evaluateUpdate(current, explosion).reason).toBe("size-anomaly")
  })

  it("accepts a sane, newer update", () => {
    const sane = bundle(
      6,
      Array.from({ length: 120 }, (_, i) => ({
        ...okEntry,
        domain: `y${i}.example.com`
      }))
    )
    const decision = evaluateUpdate(current, sane)
    expect(decision.accept).toBe(true)
    expect(decision.bundle?.version).toBe(6)
  })

  it("allows a large first update when current is the seed", () => {
    const seed: BlocklistBundle = { ...current, entries: current.entries.slice(0, 3) }
    const big = bundle(
      6,
      Array.from({ length: 5000 }, (_, i) => ({
        ...okEntry,
        domain: `z${i}.example.com`
      }))
    )
    expect(evaluateUpdate(seed, big, { currentIsSeed: true }).accept).toBe(true)
  })

  it("produces a deterministic canonical form regardless of entry order", () => {
    const a: BlocklistBundle = {
      schema: 1,
      version: 1,
      generatedAt: 0,
      entries: [
        { domain: "b.example.com", source: "manual", category: "tracker", tier: "baseline" },
        { domain: "a.example.com", source: "manual", category: "tracker", tier: "baseline" }
      ]
    }
    const b: BlocklistBundle = { ...a, entries: [...a.entries].reverse() }
    expect(canonicalizeBundle(a)).toBe(canonicalizeBundle(b))
  })
})

const manyEntries = (n: number): BlocklistEntry[] =>
  Array.from(
    { length: n },
    (_, i) => ({ ...okEntry, domain: `d${i}.example.com` })
  ) as BlocklistEntry[]

async function signWith(b: BlocklistBundle, priv: CryptoKey): Promise<string> {
  const data = new TextEncoder().encode(canonicalizeBundle(b))
  const sig = await crypto.subtle.sign("Ed25519", priv, data)
  return Buffer.from(new Uint8Array(sig)).toString("base64")
}
async function rawPub(pub: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", pub)
  return Buffer.from(new Uint8Array(raw)).toString("base64")
}

describe("blocklist version floor + seed cap (rollback + day-one over-block)", () => {
  const current: BlocklistBundle = {
    schema: 1,
    version: 3,
    generatedAt: 0,
    entries: manyEntries(100)
  }

  it("rejects an update at/below the persistent high-water floor, above active version", () => {
    // version 4 > active 3, but <= floor 5 -> still rejected (storage-reset replay)
    expect(
      evaluateUpdate(current, bundle(4, manyEntries(120)), { floorVersion: 5 }).reason
    ).toBe("not-newer")
    expect(
      evaluateUpdate(current, bundle(6, manyEntries(120)), { floorVersion: 5 }).accept
    ).toBe(true)
  })

  it("caps the first update off a fresh seed at SEED_FIRST_UPDATE_MAX", () => {
    const seed: BlocklistBundle = { schema: 1, version: 1, generatedAt: 0, entries: [okEntry] }
    expect(
      evaluateUpdate(seed, bundle(2, manyEntries(SEED_FIRST_UPDATE_MAX + 10)), {
        currentIsSeed: true
      }).reason
    ).toBe("size-anomaly")
    expect(
      evaluateUpdate(seed, bundle(2, manyEntries(SEED_FIRST_UPDATE_MAX - 10)), {
        currentIsSeed: true
      }).accept
    ).toBe(true)
  })
})

describe("blocklist multi-key verifier (zero-downtime rotation)", () => {
  it("accepts under first-match across keys, rejects wrong-key and tampered body", async () => {
    const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify"
    ])) as CryptoKeyPair
    const kpOther = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify"
    ])) as CryptoKeyPair
    const b: BlocklistBundle = { schema: 1, version: 2, generatedAt: 0, entries: [okEntry] }
    const signed: SignedBlocklistBundle = { bundle: b, signature: await signWith(b, kp.privateKey) }
    const cur: BlocklistBundle = { schema: 1, version: 1, generatedAt: 0, entries: [] }

    const right = await rawPub(kp.publicKey)
    const wrong = await rawPub(kpOther.publicKey)

    // first-match-wins: the correct key is second in the array
    expect(
      (await vetSignedUpdate(cur, signed, { currentIsSeed: true, publicKeysB64: [wrong, right] }))
        .accept
    ).toBe(true)
    // only the wrong key configured -> bad-signature
    expect(
      (await vetSignedUpdate(cur, signed, { currentIsSeed: true, publicKeysB64: [wrong] })).reason
    ).toBe("bad-signature")
    // tampered body, genuine signature -> canonical bytes differ -> bad-signature
    const tampered: SignedBlocklistBundle = {
      bundle: {
        ...b,
        entries: [
          ...b.entries,
          {
            domain: "x.evil.example",
            source: "manual",
            category: "tracker",
            tier: "baseline"
          } as BlocklistEntry
        ]
      },
      signature: signed.signature
    }
    expect(
      (await vetSignedUpdate(cur, tampered, { currentIsSeed: true, publicKeysB64: [right] })).reason
    ).toBe("bad-signature")
  })
})
