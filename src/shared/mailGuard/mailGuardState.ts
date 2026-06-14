// src/shared/mailGuard/mailGuardState.ts
// Sesyjny stan MailGuarda w pamięci realmu content-scriptu. Bez I/O i sieci.
// Pisze content/mailGuard.ts (ekstraktor DOM), czyta features/mailGuardFeature.ts.

import type { MailGuardVerdict } from "./evaluate"

export interface MailGuardStats {
  /** Ile maili oceniono w tej sesji. */
  mailsScanned: number
  /** Ile oznaczono jako high/critical. */
  flagged: number
  /** Zawsze 0 — dowód analizy w pełni lokalnej. */
  networkCalls: number
  /** Ostatni werdykt aktualnie otwartego maila (lub null). */
  lastVerdict: MailGuardVerdict | null
}

const stats: MailGuardStats = {
  mailsScanned: 0,
  flagged: 0,
  networkCalls: 0,
  lastVerdict: null
}

export function getMailGuardStats(): Readonly<MailGuardStats> {
  return stats
}

export function recordMailVerdict(verdict: MailGuardVerdict): void {
  stats.mailsScanned += 1
  if (verdict.level === "high" || verdict.level === "critical") stats.flagged += 1
  stats.lastVerdict = verdict
}

/** Tylko do testów. */
export function resetMailGuardStats(): void {
  stats.mailsScanned = 0
  stats.flagged = 0
  stats.networkCalls = 0
  stats.lastVerdict = null
}
