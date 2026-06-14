// server/sign-file.mjs <path>
// Emit <path>.sha256 and <path>.sig (base64 Ed25519 over the raw file bytes)
// using the off-box signing key. Same trust pattern as the blocklist bundle, so
// a downloaded extension package can be integrity-checked.

import { createHash, createPrivateKey, sign as edSign } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const target = process.argv[2]
if (!target || !existsSync(target)) {
  console.error("usage: node server/sign-file.mjs <path-to-file>")
  process.exit(1)
}

const pem =
  process.env.BLOCKLIST_PRIVATE_KEY_PEM ||
  (existsSync(join(HERE, ".secrets", "signing.key.pem"))
    ? readFileSync(join(HERE, ".secrets", "signing.key.pem"), "utf8")
    : null)
if (!pem) {
  console.error("No signing key (server/.secrets/signing.key.pem or BLOCKLIST_PRIVATE_KEY_PEM).")
  process.exit(1)
}

const bytes = readFileSync(target)
const sha = createHash("sha256").update(bytes).digest("hex")
const sig = edSign(null, bytes, createPrivateKey(pem)).toString("base64")

writeFileSync(`${target}.sha256`, `${sha}  ${basename(target)}\n`)
writeFileSync(`${target}.sig`, sig + "\n")
console.log(`signed ${basename(target)}`)
console.log(`  sha256: ${sha}`)
console.log(`  sig:    ${sig.slice(0, 24)}...`)
