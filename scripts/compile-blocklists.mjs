// scripts/compile-blocklists.mjs
//
// Build-time compiler for the blocklist data layer. Fetches license-clean feeds
// (HaGeZi GPL-3.0 + Phishing.Database MIT), dedups/compresses via AdGuard's
// hostlist-compiler, tags provenance, and overwrites
// src/shared/blocklist/baselineBundle.ts with the compiled bundle.
//
// Usage:
//   npm i -D @adguard/hostlist-compiler
//   node scripts/compile-blocklists.mjs            # compile baseline bundle
//   node scripts/compile-blocklists.mjs --keygen   # write a fresh Ed25519 keypair
//   node scripts/compile-blocklists.mjs --sign <bundle.json>  # sign for server
//
// The signing private key must live OFF the public update server. Generate it
// with --keygen, paste the PUBLIC key into secureUpdater.ts (UPDATE_PUBLIC_KEY_B64),
// keep the PRIVATE key in CI/secret storage, and sign released bundles off-box.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import {
  generateKeyPairSync,
  sign as edSign,
  createPublicKey,
  createPrivateKey
} from "node:crypto"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const OUT_TS = join(ROOT, "src", "shared", "blocklist", "baselineBundle.ts")
const ALLOWLIST_TS = join(ROOT, "src", "shared", "blocklist", "allowlist.ts")
const PRIVATE_KEY_PATH = join(ROOT, "server", ".secrets", "signing.key.pem")

// Keep parity with bundleSchema.ts MAX_BUNDLE_ENTRIES (dynamic-rule budget).
const MAX_ENTRIES = 25_000

// Feed registry: each source maps to provenance + a tier. Order matters — the
// first source to claim a domain wins its provenance (de-dup is global).
const FEEDS = [
  {
    source: "phishing-db",
    category: "phishing",
    tier: "baseline",
    cap: 8000,
    sources: [
      {
        source:
          "https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt",
        type: "hosts"
      }
    ]
  },
  {
    source: "hagezi-tif",
    category: "malware",
    tier: "baseline",
    cap: 8000,
    sources: [
      {
        source:
          "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/tif.mini.txt",
        type: "adblock"
      }
    ]
  },
  {
    source: "hagezi-pro",
    category: "tracker",
    tier: "baseline",
    cap: 7000,
    sources: [
      {
        source:
          "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.mini.txt",
        type: "adblock"
      }
    ]
  },
  {
    source: "hagezi-nrd",
    category: "nrd",
    tier: "escalated",
    cap: 2000,
    sources: [
      {
        source:
          "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/nrd7.txt",
        type: "adblock"
      }
    ]
  }
]

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const ALLOWLIST_SOURCE = readFileSync(ALLOWLIST_TS, "utf8")
const NEVER_BLOCK = new Set(readStringLiteralsFromConst("NEVER_BLOCK"))
const NEVER_BLOCK_SUFFIXES = readStringLiteralsFromConst("NEVER_BLOCK_SUFFIXES")

function readStringLiteralsFromConst(name) {
  const start = ALLOWLIST_SOURCE.indexOf(`const ${name}`)
  if (start === -1) throw new Error(`Missing allowlist const ${name}`)
  const end = ALLOWLIST_SOURCE.indexOf("])", start)
  if (end === -1) throw new Error(`Malformed allowlist const ${name}`)
  return Array.from(ALLOWLIST_SOURCE.slice(start, end).matchAll(/"([^"]+)"/g), (m) => m[1])
}

function isAllowlisted(domain) {
  const host = domain.toLowerCase().replace(/\.$/, "")
  if (NEVER_BLOCK.has(host)) return true
  for (const allowed of NEVER_BLOCK) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true
  }
  for (const suffix of NEVER_BLOCK_SUFFIXES) {
    if (host === suffix.slice(1) || host.endsWith(suffix)) return true
  }
  return false
}

async function loadCompiler() {
  try {
    const mod = await import("@adguard/hostlist-compiler")
    return mod.default || mod
  } catch {
    console.error(
      "Missing @adguard/hostlist-compiler. Run: npm i -D @adguard/hostlist-compiler"
    )
    process.exit(1)
  }
}

/** Extract bare domains from compiled adblock rules like `||example.org^`. */
function rulesToDomains(rules) {
  const out = []
  for (const line of rules) {
    if (!line || line.startsWith("!") || line.startsWith("#")) continue
    const m = /^\|\|([a-z0-9.-]+)\^/i.exec(line.trim())
    const domain = (m ? m[1] : line.trim()).toLowerCase()
    if (DOMAIN_RE.test(domain)) out.push(domain)
  }
  return out
}

async function compileBaseline() {
  const compile = await loadCompiler()
  const allowPartial = process.argv.includes("--allow-partial")
  const seen = new Set()
  const entries = []

  for (const feed of FEEDS) {
    process.stdout.write(`Compiling ${feed.source}... `)
    let rules = []
    try {
      rules = await compile({
        name: feed.source,
        sources: feed.sources,
        transformations: ["RemoveComments", "Compress", "Deduplicate"]
      })
    } catch (err) {
      console.log(`FAILED (${err?.message || err})`)
      if (!allowPartial) {
        console.error("Feed compilation failed — refusing partial baseline. Use --allow-partial only for explicit recovery builds.")
        process.exit(1)
      }
      console.warn("Continuing because --allow-partial was explicitly set.")
      continue
    }
    let added = 0
    for (const domain of rulesToDomains(rules)) {
      if (added >= feed.cap || entries.length >= MAX_ENTRIES) break
      if (isAllowlisted(domain)) continue
      if (seen.has(domain)) continue
      seen.add(domain)
      entries.push({
        domain,
        source: feed.source,
        category: feed.category,
        tier: feed.tier
      })
      added += 1
    }
    console.log(`${added} domains`)
  }

  if (entries.length === 0) {
    console.error("No domains compiled — refusing to overwrite baseline.")
    process.exit(1)
  }

  const bundle = {
    schema: 1,
    version: Number(process.env.BUNDLE_VERSION || 2),
    generatedAt: 0, // keep deterministic; stamp at sign time if needed
    entries
  }
  writeBaselineTs(bundle)
  const counts = entries.reduce((acc, e) => {
    acc[e.tier] = (acc[e.tier] || 0) + 1
    return acc
  }, {})
  console.log(`\nWrote ${entries.length} entries to ${OUT_TS}`)
  console.log(`Tiers:`, counts)
}

function writeBaselineTs(bundle) {
  // Pack entries into ONE tab/newline-delimited string literal. Domains and the
  // fixed enum values never contain tab/newline, so the round-trip is lossless.
  // This keeps the generated module's TS surface to a single `string` type —
  // emitting 25k object literals makes TypeScript infer a union of 25k literal
  // object types and trips TS2590 ("union type too complex to represent"). The
  // server's build-bundle.mjs parses the same PACKED literal (keep both in sync).
  const packed = bundle.entries
    .map((e) => `${e.domain}\t${e.source}\t${e.category}\t${e.tier}`)
    .join("\n")
  const ts = `// src/shared/blocklist/baselineBundle.ts
// GENERATED by scripts/compile-blocklists.mjs — do not edit by hand.
// Feeds: HaGeZi (GPL-3.0) + Phishing.Database (MIT). Counts drift per run.

import type { BlocklistBundle, BlocklistEntry } from "./types"

// One delimited string per entry: "domain\\tsource\\tcategory\\ttier". Stored as a
// single string literal (not 25k object literals) so TypeScript does not build a
// 25k-wide union type and trip TS2590. Reconstructed into typed entries at load.
const PACKED = ${JSON.stringify(packed)}

const ENTRIES: BlocklistEntry[] = PACKED.split("\\n").map((line) => {
  const [domain, source, category, tier] = line.split("\\t")
  return { domain, source, category, tier } as BlocklistEntry
})

export const BASELINE_BUNDLE: BlocklistBundle = {
  schema: 1,
  version: ${bundle.version},
  generatedAt: ${bundle.generatedAt},
  entries: ENTRIES
}
`
  writeFileSync(OUT_TS, ts, "utf8")
}

function keygen() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const pubRaw = publicKey.export({ format: "jwk" }).x // base64url, 32 bytes
  const pubB64 = Buffer.from(pubRaw, "base64url").toString("base64")
  const privPem = privateKey.export({ format: "pem", type: "pkcs8" })
  mkdirSync(dirname(PRIVATE_KEY_PATH), { recursive: true })
  writeFileSync(PRIVATE_KEY_PATH, privPem, { mode: 0o600 })
  console.log("PUBLIC KEY (paste into secureUpdater.ts UPDATE_PUBLIC_KEY_B64):")
  console.log(pubB64)
  console.log(`\nPRIVATE KEY written to ${PRIVATE_KEY_PATH}`)
  console.log("Private PEM is never printed to stdout.")
}

// Canonical form must match bundleSchema.ts canonicalizeBundle().
function canonicalize(bundle) {
  const entries = [...bundle.entries]
    .sort((a, b) => (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0))
    .map((e) => ({
      domain: e.domain,
      source: e.source,
      category: e.category,
      tier: e.tier
    }))
  return JSON.stringify({
    schema: bundle.schema,
    version: bundle.version,
    generatedAt: bundle.generatedAt,
    entries
  })
}

function loadPrivateKeyPem() {
  const keyPath = process.env.BLOCKLIST_PRIVATE_KEY_FILE || PRIVATE_KEY_PATH
  try {
    return readFileSync(keyPath, "utf8")
  } catch {
    return null
  }
}

function signBundle(bundlePath) {
  const privPem = loadPrivateKeyPem()
  if (!privPem) {
    console.error("No signing key. Run `node scripts/compile-blocklists.mjs --keygen` or set BLOCKLIST_PRIVATE_KEY_FILE.")
    process.exit(1)
  }
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8"))
  const key = createPrivateKey(privPem)
  const data = Buffer.from(canonicalize(bundle), "utf8")
  const signature = edSign(null, data, key).toString("base64")
  const out = bundlePath.replace(/\.json$/, "") + ".signed.json"
  writeFileSync(out, JSON.stringify({ bundle, signature }, null, 2), "utf8")
  console.log(`Signed bundle -> ${out}`)
}

const arg = process.argv[2]
if (arg === "--keygen") keygen()
else if (arg === "--sign") signBundle(process.argv[3])
else await compileBaseline()

// Silence unused-import lint when only some branches run.
void createPublicKey
