// server/build-bundle.mjs
// Sign + publish a blocklist bundle. Reads the bundle (a compiled JSON, or the
// committed baseline extracted from baselineBundle.ts), signs its canonical form
// with the OFF-BOX Ed25519 private key, and writes out/bundle.signed.json +
// out/manifest.json atomically (tmp + rename) so a client never reads a
// half-written file.
//
// Usage:
//   BUNDLE_VERSION=2 node server/build-bundle.mjs            # sign baseline seed
//   node server/build-bundle.mjs path/to/compiled-bundle.json
// Key source (in order): $BLOCKLIST_PRIVATE_KEY_PEM, else server/.secrets/signing.key.pem

import { createHash, createPrivateKey, sign as edSign } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const OUT = join(HERE, "out")
const BASELINE_TS = join(ROOT, "src", "shared", "blocklist", "baselineBundle.ts")

function loadPrivateKey() {
  const pem =
    process.env.BLOCKLIST_PRIVATE_KEY_PEM ||
    (existsSync(join(HERE, ".secrets", "signing.key.pem"))
      ? readFileSync(join(HERE, ".secrets", "signing.key.pem"), "utf8")
      : null)
  if (!pem) {
    console.error(
      "No signing key. Run `node server/keygen.mjs` or set BLOCKLIST_PRIVATE_KEY_PEM."
    )
    process.exit(1)
  }
  return createPrivateKey(pem)
}

// Extract entries from the generated baselineBundle.ts (single source of truth).
// The .ts packs entries into one tab/newline-delimited PACKED string literal (see
// writeBaselineTs in scripts/compile-blocklists.mjs) — parse the same format here.
function loadBaselineBundle() {
  const text = readFileSync(BASELINE_TS, "utf8")
  const packedMatch = /const PACKED =\s*("(?:[^"\\]|\\.)*")/.exec(text)
  const entries = []
  if (packedMatch) {
    const packed = JSON.parse(packedMatch[1]) // un-escape the string literal
    for (const line of packed.split("\n")) {
      if (!line) continue
      const [domain, source, category, tier] = line.split("\t")
      entries.push({ domain, source, category, tier })
    }
  }
  const versionMatch = /version:\s*(\d+)/.exec(text)
  return {
    schema: 1,
    version: versionMatch ? Number(versionMatch[1]) : 1,
    generatedAt: 0,
    entries
  }
}

// MUST match src/shared/blocklist/bundleSchema.ts canonicalizeBundle().
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

function atomicWrite(path, contents) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, contents)
  if (existsSync(path)) rmSync(path)
  renameSync(tmp, path)
}

const arg = process.argv[2]
const source = arg
  ? JSON.parse(readFileSync(arg, "utf8"))
  : loadBaselineBundle()

// Operator controls the monotonic release version. Default 2 so the presmoke
// bundle is newer than the shipped seed (version 1) and the client accepts it.
const version = Number(process.env.BUNDLE_VERSION || Math.max(source.version + 1, 2))
if (!Number.isInteger(version) || version < 1) {
  console.error(`Invalid BUNDLE_VERSION: ${process.env.BUNDLE_VERSION}`)
  process.exit(1)
}
// Stamp generatedAt at sign time so it carries real provenance (it is inside the
// signed canonical bytes). Override with SOURCE_DATE_EPOCH for reproducible builds.
const generatedAt = process.env.SOURCE_DATE_EPOCH
  ? Number(process.env.SOURCE_DATE_EPOCH) * 1000
  : Date.now()
const bundle = { schema: 1, version, generatedAt, entries: source.entries }

const key = loadPrivateKey()
const signature = edSign(null, Buffer.from(canonicalize(bundle), "utf8"), key).toString("base64")
const signed = { bundle, signature }
const signedJson = JSON.stringify(signed)

mkdirSync(OUT, { recursive: true })
atomicWrite(join(OUT, "bundle.signed.json"), signedJson)

const manifest = {
  schema: 1,
  version,
  generatedAt,
  entryCount: bundle.entries.length,
  sha256: createHash("sha256").update(signedJson).digest("hex"),
  etag: `"v${version}-${createHash("sha256").update(signedJson).digest("hex").slice(0, 16)}"`
}
atomicWrite(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2))

console.log(`Signed bundle v${version} · ${bundle.entries.length} entries`)
console.log(`  ${join(OUT, "bundle.signed.json")}`)
console.log(`  ${join(OUT, "manifest.json")}  (sha256 ${manifest.sha256.slice(0, 16)}…)`)
