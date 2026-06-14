// src/shared/blocklist/secureUpdater.ts
// The cryptographic half of the supply-chain defense. A runtime update is only
// accepted if it (1) carries a valid Ed25519 signature from our baked-in public
// key, (2) is strictly newer than what we hold (anti-rollback), and (3) is not
// an implausible size jump (anomaly gate). Any failure => keep last-known-good.
//
// The private signing key NEVER lives on the public update server: bundles are
// signed off-box (laptop / CI) and only the signed artifact is uploaded. So a
// compromised server can serve garbage but cannot forge a signature; and even a
// stolen key is bounded by the capability constraint in bundleSchema.ts.

import {
  canonicalizeBundle,
  sanitizeBundle,
  type SanitizeResult
} from "./bundleSchema"
import type { BlocklistBundle, SignedBlocklistBundle } from "./types"

// Base64 (raw, 32-byte) Ed25519 public keys. Private halves live off-box
// (server/.secrets/signing.key.pem, gitignored). MULTI-KEY (first-match-wins) so
// key rotation is recoverable in-band: provision K_next here ONE release before
// you start signing with it, then retire the old key a release later. Empty
// array disables remote updates (bundled baseline still protects the user).
export const UPDATE_PUBLIC_KEYS_B64: string[] = [
  "7+UhIUMQT9IEbt4MlStInK4qeyuhMsIOvZRqz4XOD/g="
  // "<K_next>"  // add the next key here before rotating
]

/** True if any signing key is configured. */
export function hasUpdateKey(): boolean {
  return UPDATE_PUBLIC_KEYS_B64.some((k) => k.length > 0)
}

// Even on a fresh install (currentIsSeed) the first update cannot land more than
// this many blocks in one shot — bounds a stolen-key max-over-block on day one.
export const SEED_FIRST_UPDATE_MAX = 12_000

export type UpdateRejectReason =
  | "no-public-key"
  | "bad-signature"
  | "not-newer"
  | "size-anomaly"
  | "empty"
  | "invalid-structure"

export interface UpdateDecision {
  accept: boolean
  reason?: UpdateRejectReason
  bundle?: BlocklistBundle
  diagnostics?: SanitizeResult["dropped"]
}

const subtle = (): SubtleCrypto | null =>
  (globalThis.crypto && globalThis.crypto.subtle) || null

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function utf8Bytes(text: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(text)
  const bytes = new Uint8Array(new ArrayBuffer(encoded.length))
  bytes.set(encoded)
  return bytes
}

/**
 * Verify an Ed25519 signature over the canonical bytes of `bundle` against ANY
 * configured public key (first-match-wins), enabling zero-downtime rotation.
 */
export async function verifyBundleSignature(
  signed: SignedBlocklistBundle,
  publicKeysB64: string[] = UPDATE_PUBLIC_KEYS_B64
): Promise<boolean> {
  const crypto = subtle()
  if (!crypto) return false
  let sig: Uint8Array<ArrayBuffer>
  try {
    sig = base64ToBytes(signed.signature)
  } catch {
    return false
  }
  const data = utf8Bytes(canonicalizeBundle(signed.bundle))
  for (const publicKeyB64 of publicKeysB64) {
    if (!publicKeyB64) continue
    try {
      const key = await crypto.importKey(
        "raw",
        base64ToBytes(publicKeyB64),
        { name: "Ed25519" },
        false,
        ["verify"]
      )
      if (await crypto.verify("Ed25519", key, sig, data)) return true
    } catch {
      // Unsupported algorithm / malformed key => try the next key.
    }
  }
  return false
}

/**
 * Decide whether to accept a fetched, signature-verified update relative to the
 * bundle we currently hold. Pure (no I/O) so it is unit-testable.
 *
 * `currentIsSeed` relaxes the size-anomaly gate for the very first update (the
 * baked-in baseline is intentionally small, so the first real fetch is allowed
 * to be much larger).
 */
export function evaluateUpdate(
  current: BlocklistBundle,
  incomingRaw: unknown,
  options: { currentIsSeed?: boolean; floorVersion?: number } = {}
): UpdateDecision {
  let sanitized: SanitizeResult
  try {
    sanitized = sanitizeBundle(incomingRaw)
  } catch {
    return { accept: false, reason: "invalid-structure" }
  }
  const incoming = sanitized.bundle

  if (incoming.entries.length === 0) {
    return { accept: false, reason: "empty", diagnostics: sanitized.dropped }
  }
  // Anti-rollback floor is the MAX of the active bundle version and a persisted
  // high-water mark — so wiping the active bundle (but not the mark) can't be
  // used to replay an old, validly-signed bundle.
  const floor = Math.max(current.version, options.floorVersion ?? 0)
  if (incoming.version <= floor) {
    return { accept: false, reason: "not-newer", diagnostics: sanitized.dropped }
  }

  if (options.currentIsSeed || current.entries.length === 0) {
    // First update off the baked-in seed: skip the ratio gate (the seed is
    // intentionally small) but enforce an ABSOLUTE cap so a stolen key can't
    // land a maximum over-block on fresh installs in one shot.
    if (incoming.entries.length > SEED_FIRST_UPDATE_MAX) {
      return {
        accept: false,
        reason: "size-anomaly",
        diagnostics: sanitized.dropped
      }
    }
  } else {
    const ratio = incoming.entries.length / current.entries.length
    // Reject a >90% shrink or a >8x explosion — both smell like a poisoned feed.
    if (ratio < 0.1 || ratio > 8) {
      return {
        accept: false,
        reason: "size-anomaly",
        diagnostics: sanitized.dropped
      }
    }
  }

  return { accept: true, bundle: incoming, diagnostics: sanitized.dropped }
}

/**
 * Full gate for a fetched signed bundle: signature first, then freshness +
 * anomaly. Returns the accepted bundle or a rejection reason.
 */
export async function vetSignedUpdate(
  current: BlocklistBundle,
  signed: SignedBlocklistBundle,
  options: {
    currentIsSeed?: boolean
    floorVersion?: number
    publicKeysB64?: string[]
  } = {}
): Promise<UpdateDecision> {
  const publicKeysB64 = options.publicKeysB64 ?? UPDATE_PUBLIC_KEYS_B64
  if (!publicKeysB64.some((k) => k.length > 0)) {
    return { accept: false, reason: "no-public-key" }
  }

  const signatureOk = await verifyBundleSignature(signed, publicKeysB64)
  if (!signatureOk) return { accept: false, reason: "bad-signature" }

  return evaluateUpdate(current, signed.bundle, {
    currentIsSeed: options.currentIsSeed,
    floorVersion: options.floorVersion
  })
}
