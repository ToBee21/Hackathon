// server/keygen.mjs
// Generate an Ed25519 signing keypair for the blocklist update channel, and
// self-test that the SAME public key verifies under WebCrypto SubtleCrypto
// (which is what the extension client uses). The private key is written to
// server/.secrets/signing.key.pem (gitignored, off the public server). The
// public key (base64 raw, 32 bytes) goes into secureUpdater.ts.

import { generateKeyPairSync, sign as edSign, webcrypto } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const SECRETS = join(HERE, ".secrets")

const { publicKey, privateKey } = generateKeyPairSync("ed25519")
const pubB64 = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("base64")
const privPem = privateKey.export({ format: "pem", type: "pkcs8" })

mkdirSync(SECRETS, { recursive: true })
writeFileSync(join(SECRETS, "signing.key.pem"), privPem, { mode: 0o600 })

// Self-test: sign with node, verify with WebCrypto raw-key import (client path).
const msg = new TextEncoder().encode("privacymyst-presmoke")
const sig = edSign(null, Buffer.from(msg), privateKey)
const rawPub = Buffer.from(pubB64, "base64")
const key = await webcrypto.subtle.importKey(
  "raw",
  rawPub,
  { name: "Ed25519" },
  false,
  ["verify"]
)
const ok = await webcrypto.subtle.verify("Ed25519", key, sig, msg)

console.log("WEBCRYPTO_ED25519_VERIFY:", ok ? "OK" : "FAILED")
console.log("PUBLIC_KEY_B64:", pubB64)
console.log("PRIVATE_KEY_FILE:", join(SECRETS, "signing.key.pem"))
if (!ok) process.exit(1)
