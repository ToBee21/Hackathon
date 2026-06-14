// src/shared/mailGuard/campaignFingerprint.ts
// Stabilny, anonimowy odcisk WZORCA ataku (nie tożsamości człowieka) — w pełni
// lokalny, prywatny. Te same kampanie z tego samego klastra aktora produkują ten
// sam hash, więc powtórki da się wykryć bez przechowywania surowych URL-i.
//
// Hash: FNV-1a 32-bit (jak hashPathWithoutRawUrl w ../aiDeepDive/normalize oraz
// derivePageScopedSeed w src/content.ts). CZYSTY: bez Math.random, bez Date.now —
// te same dane wejściowe zawsze dają ten sam wynik.

import type { FingerprintInput } from "./types"

/** Separator, który nie może wystąpić w znormalizowanych polach. */
const FIELD_SEPARATOR = "|"

/** Normalizacja pojedynczego pola: null/undefined → "", trim, lowercase. */
function normalizeField(value: string | null | undefined): string {
  if (value == null) return ""
  return value.trim().toLowerCase()
}

/** FNV-1a 32-bit po stringu → 8-znakowy hex (zero-padded). */
function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

/**
 * Liczy stabilny, anonimowy odcisk kampanii.
 * Kolejność pól jest STAŁA — zmiana kolejności złamałaby stabilność hashy.
 */
export function computeCampaignFingerprint(input: FingerprintInput): string {
  const material = [
    normalizeField(input.senderDomainPattern),
    normalizeField(input.targetBrand),
    normalizeField(input.linkDomainPattern),
    normalizeField(input.attachmentArchetype),
    normalizeField(input.moArchetype)
  ].join(FIELD_SEPARATOR)

  return `cmp_${fnv1a32Hex(material)}`
}

export interface CampaignRecord {
  fingerprint: string
  firstSeen: number
  lastSeen: number
  count: number
}

/** Tracker w pamięci modułu — celowo nietrwały, czyszczony przez resetCampaigns. */
const campaigns = new Map<string, CampaignRecord>()

/**
 * Rejestruje sygnał kampanii. Pierwszy raz: firstSeen=lastSeen=now, count=1.
 * Kolejne: lastSeen=now, count++ (firstSeen zostaje). `now` podawany z zewnątrz,
 * żeby moduł był czysty i testowalny — nie wołamy Date.now wewnętrznie.
 */
export function recordCampaign(fingerprint: string, now: number): CampaignRecord {
  const existing = campaigns.get(fingerprint)
  if (existing) {
    existing.lastSeen = now
    existing.count += 1
    return existing
  }
  const record: CampaignRecord = {
    fingerprint,
    firstSeen: now,
    lastSeen: now,
    count: 1
  }
  campaigns.set(fingerprint, record)
  return record
}

export function getCampaign(fingerprint: string): CampaignRecord | null {
  return campaigns.get(fingerprint) ?? null
}

/** True, jeśli kampanię widziano co najmniej dwa razy. */
export function isRepeatOffender(fingerprint: string): boolean {
  const record = campaigns.get(fingerprint)
  return record != null && record.count >= 2
}

/** Czyści tracker (dla testów / resetu sesji). */
export function resetCampaigns(): void {
  campaigns.clear()
}
