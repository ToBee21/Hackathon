// src/shared/blocklist/bundleSchema.ts
// Strict validation + capability enforcement for a blocklist bundle.
//
// This is the structural half of the supply-chain defense: untrusted bytes are
// parsed into a bundle whose ONLY expressible action is "block domain". Anything
// that is not a well-formed domain entry is dropped; structurally invalid input
// is rejected outright. No code path here can produce an allow/redirect/header
// rule, because the type system and this validator have no field for one.

import { isAllowlisted } from "./allowlist"
import {
  KNOWN_CATEGORIES,
  KNOWN_SOURCES,
  KNOWN_TIERS,
  type BlocklistBundle,
  type BlocklistCategory,
  type BlocklistEntry,
  type BlocklistSource,
  type BlocklistTier
} from "./types"

// Stay comfortably under MAX_NUMBER_OF_DYNAMIC_RULES (30k) while leaving room
// for per-origin escalation rules and the existing targeting-shield rules.
export const MAX_BUNDLE_ENTRIES = 25_000

// A plain registrable hostname: labels of [a-z0-9-], dot-separated, with a TLD.
// No scheme, no path, no wildcard, no port, no whitespace — this is what keeps a
// hostile bundle from smuggling a broad/over-matching pattern.
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export class BlocklistValidationError extends Error {}

export interface SanitizeResult {
  bundle: BlocklistBundle
  /** Diagnostics for logging — never thrown, just reported. */
  dropped: {
    malformedDomain: number
    unknownEnum: number
    allowlisted: number
    duplicate: number
    overflow: number
  }
}

/**
 * Validate + sanitize raw (untrusted) bundle data. Throws only on STRUCTURAL
 * failure (wrong shape / non-monotonic-able version). Individual bad entries are
 * dropped, not fatal, so one poisoned line cannot deny the whole update.
 */
export function sanitizeBundle(raw: unknown): SanitizeResult {
  if (!raw || typeof raw !== "object") {
    throw new BlocklistValidationError("bundle is not an object")
  }
  const obj = raw as Record<string, unknown>

  if (obj.schema !== 1) {
    throw new BlocklistValidationError(`unsupported schema: ${String(obj.schema)}`)
  }
  const version = obj.version
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    throw new BlocklistValidationError("version must be a non-negative integer")
  }
  const generatedAt =
    typeof obj.generatedAt === "number" && Number.isFinite(obj.generatedAt)
      ? obj.generatedAt
      : 0
  if (!Array.isArray(obj.entries)) {
    throw new BlocklistValidationError("entries must be an array")
  }

  const dropped = {
    malformedDomain: 0,
    unknownEnum: 0,
    allowlisted: 0,
    duplicate: 0,
    overflow: 0
  }
  const seen = new Set<string>()
  const entries: BlocklistEntry[] = []

  for (const candidate of obj.entries) {
    if (entries.length >= MAX_BUNDLE_ENTRIES) {
      dropped.overflow += 1
      continue
    }
    if (!candidate || typeof candidate !== "object") {
      dropped.malformedDomain += 1
      continue
    }
    const record = candidate as Record<string, unknown>
    const domain =
      typeof record.domain === "string"
        ? record.domain.trim().toLowerCase().replace(/\.$/, "")
        : ""
    if (!HOSTNAME_RE.test(domain)) {
      dropped.malformedDomain += 1
      continue
    }
    if (
      !KNOWN_SOURCES.has(record.source as BlocklistSource) ||
      !KNOWN_CATEGORIES.has(record.category as BlocklistCategory) ||
      !KNOWN_TIERS.has(record.tier as BlocklistTier)
    ) {
      dropped.unknownEnum += 1
      continue
    }
    if (isAllowlisted(domain)) {
      dropped.allowlisted += 1
      continue
    }
    if (seen.has(domain)) {
      dropped.duplicate += 1
      continue
    }
    seen.add(domain)
    entries.push({
      domain,
      source: record.source as BlocklistSource,
      category: record.category as BlocklistCategory,
      tier: record.tier as BlocklistTier
    })
  }

  return {
    bundle: { schema: 1, version, generatedAt, entries },
    dropped
  }
}

/**
 * Deterministic byte representation a bundle is signed over. Both the signer
 * (build/server) and verifier (client) must produce identical bytes, so keys
 * are emitted in a fixed order and entries sorted by domain.
 */
export function canonicalizeBundle(bundle: BlocklistBundle): string {
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

export function countByTier(bundle: BlocklistBundle): {
  baseline: number
  escalated: number
} {
  let baseline = 0
  let escalated = 0
  for (const entry of bundle.entries) {
    if (entry.tier === "escalated") escalated += 1
    else baseline += 1
  }
  return { baseline, escalated }
}
