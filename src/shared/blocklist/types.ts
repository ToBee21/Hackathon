// src/shared/blocklist/types.ts
// Shared shapes for the blocklist data layer.
//
// CAPABILITY CONSTRAINT (security-critical): a bundle can express ONLY "block
// this domain". There is deliberately no field for allow / redirect / header
// rewrite / regex. A fetched bundle — even a maliciously signed one — therefore
// cannot turn the extension into an exfiltration tool or silently unblock
// malware; the worst it can do is over-block, which is recoverable. See
// bundleSchema.ts (enforcement) and secureUpdater.ts (signature/rollback).

/** Which feed/category flagged a domain — surfaced as provenance in the UI. */
export type BlocklistSource =
  | "hagezi-tif"
  | "hagezi-nrd"
  | "hagezi-pro"
  | "phishing-db"
  | "easyprivacy"
  | "threatfox"
  | "urlhaus"
  | "manual"

export type BlocklistCategory =
  | "malware"
  | "phishing"
  | "c2"
  | "scam"
  | "cryptojacking"
  | "tracker"
  | "advertising"
  | "nrd"

/**
 * baseline  -> always blocked everywhere (loose, low false-positive set).
 * escalated -> blocked only on origins the AI flags high/critical
 *              ("scorched earth on sensitive pages").
 */
export type BlocklistTier = "baseline" | "escalated"

export interface BlocklistEntry {
  domain: string
  source: BlocklistSource
  category: BlocklistCategory
  tier: BlocklistTier
}

export interface BlocklistBundle {
  schema: 1
  /** Monotonic; an update with version <= current is rejected (anti-rollback). */
  version: number
  generatedAt: number
  entries: BlocklistEntry[]
}

/** Wire format for a runtime update: bundle + detached Ed25519 signature. */
export interface SignedBlocklistBundle {
  bundle: BlocklistBundle
  /** base64 Ed25519 signature over the canonical bytes of `bundle`. */
  signature: string
}

/** Per-domain provenance kept in memory for "why was this blocked" lookups. */
export interface BlockProvenance {
  source: BlocklistSource
  category: BlocklistCategory
  tier: BlocklistTier
}

export const KNOWN_SOURCES: ReadonlySet<BlocklistSource> = new Set([
  "hagezi-tif",
  "hagezi-nrd",
  "hagezi-pro",
  "phishing-db",
  "easyprivacy",
  "threatfox",
  "urlhaus",
  "manual"
])

export const KNOWN_CATEGORIES: ReadonlySet<BlocklistCategory> = new Set([
  "malware",
  "phishing",
  "c2",
  "scam",
  "cryptojacking",
  "tracker",
  "advertising",
  "nrd"
])

export const KNOWN_TIERS: ReadonlySet<BlocklistTier> = new Set([
  "baseline",
  "escalated"
])

/** Human label for a source, used in provenance log lines. */
export const SOURCE_LABEL: Record<BlocklistSource, string> = {
  "hagezi-tif": "HaGeZi Threat-Intel",
  "hagezi-nrd": "HaGeZi nowe domeny",
  "hagezi-pro": "HaGeZi Pro",
  "phishing-db": "Phishing.Database",
  easyprivacy: "EasyPrivacy",
  threatfox: "ThreatFox",
  urlhaus: "URLhaus",
  manual: "lista wbudowana"
}

export const CATEGORY_LABEL: Record<BlocklistCategory, string> = {
  malware: "malware",
  phishing: "phishing",
  c2: "serwer C2",
  scam: "scam",
  cryptojacking: "cryptojacking",
  tracker: "tracker",
  advertising: "reklama",
  nrd: "świeżo zarejestrowana domena"
}
