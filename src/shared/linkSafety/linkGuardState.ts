// src/shared/linkSafety/linkGuardState.ts
// Współdzielony, sesyjny stan Link Guarda. Bez I/O i bez sieci — to tylko
// liczniki w pamięci realmu content-scriptu. Pisze do niego linkGuard.ts
// (warstwa hover/klik), czyta linkGuardFeature.ts (karta w panelu floating).
//
// `networkCalls` jest częścią KONTRAKTU produktu: ma zawsze wynosić 0 i służy
// jako jawny dowód, że analiza jest w 100% lokalna (zero-network).

import type { LinkRiskLevel } from "./urlHeuristics"

export interface LinkGuardVerdictSnapshot {
  domain: string
  level: LinkRiskLevel
  score: number
  odds: number
}

export interface LinkGuardStats {
  /** Ile linków przeanalizowano na hover w tej sesji. */
  linksScanned: number
  /** Ile z nich miało poziom high/critical. */
  highRiskFlagged: number
  /** Ile kliknięć przechwycono bramką (pokazano modal). */
  clicksGated: number
  /** Ile kliknięć użytkownik twardo zablokował. */
  clicksBlocked: number
  /** Ile kliknięć użytkownik świadomie przepuścił mimo ryzyka. */
  clicksOverridden: number
  /** Zawsze 0 — dowód, że nic nie wyszło do sieci. */
  networkCalls: number
  /** Ostatni policzony werdykt (do podglądu w karcie). */
  lastVerdict: LinkGuardVerdictSnapshot | null
}

const stats: LinkGuardStats = {
  linksScanned: 0,
  highRiskFlagged: 0,
  clicksGated: 0,
  clicksBlocked: 0,
  clicksOverridden: 0,
  networkCalls: 0,
  lastVerdict: null
}

export function getLinkGuardStats(): Readonly<LinkGuardStats> {
  return stats
}

export function recordScan(verdict: LinkGuardVerdictSnapshot, highRisk: boolean): void {
  stats.linksScanned += 1
  if (highRisk) stats.highRiskFlagged += 1
  stats.lastVerdict = verdict
}

export function recordGate(): void {
  stats.clicksGated += 1
}

export function recordBlock(): void {
  stats.clicksBlocked += 1
}

export function recordOverride(): void {
  stats.clicksOverridden += 1
}

/** Tylko do testów — przywraca czysty stan między przypadkami. */
export function resetLinkGuardStats(): void {
  stats.linksScanned = 0
  stats.highRiskFlagged = 0
  stats.clicksGated = 0
  stats.clicksBlocked = 0
  stats.clicksOverridden = 0
  stats.networkCalls = 0
  stats.lastVerdict = null
}
