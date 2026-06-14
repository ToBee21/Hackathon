// src/shared/features/mailGuardFeature.ts
// Feature — MailGuard. Karta w panelu floating dla aktualnie otwartego maila:
// archetyp ataku (MO), podszycie pod markę, sygnały, powtarzalność kampanii.
// Czyta tylko snapshot z mailGuardState (zasilany przez content/mailGuard).

import type { CardLevel, Feature, FeatureCard } from "../featureRegistry"
import { moArchetypeLabel } from "../mailGuard/evaluate"
import { getMailGuardStats } from "../mailGuard/mailGuardState"

export const mailGuardFeature: Feature = {
  featureId: "mail-guard",
  title: "MailGuard",
  shortDescription:
    "Lokalna analiza nadawcy, załączników i wzorca ataku w otwartym mailu. Zero sieci.",
  riskLevel: "critical",
  requiredCapabilities: [],
  activation: (page) => !page.excluded,
  run: (): FeatureCard | null => {
    const s = getMailGuardStats()
    const v = s.lastVerdict
    // Brak ocenionego maila => żadnej karty (nie zaśmiecamy nie-webmaili).
    if (!v) return null

    const level: CardLevel =
      v.level === "critical" || v.level === "high" || v.level === "medium"
        ? v.level
        : "low"

    const lines: string[] = [
      `Modus operandi: ${moArchetypeLabel(v.archetype)} (pewność ${Math.round(v.confidence * 100)}%).`
    ]
    if (v.lookalikeBrand) {
      lines.push(`Nadawca podszywa się pod: ${v.lookalikeBrand} (domena ${v.senderDomain}).`)
    }
    for (const tell of v.tells.slice(0, 3)) lines.push(tell)
    if (v.repeatOffender) {
      lines.push(`Powtarzalny wzorzec: widziany ${v.seenCount}x w tej sesji.`)
    }
    lines.push(`${s.networkCalls} połączeń sieciowych — analiza w 100% lokalna.`)

    return {
      featureId: "mail-guard",
      title: "MailGuard",
      level,
      score: v.score,
      lines,
      evidence: v.signals.slice(0, 4).map((sig) => sig.reason),
      action:
        v.level === "high" || v.level === "critical"
          ? "Nie otwieraj załączników i nie klikaj linków; zweryfikuj nadawcę innym kanałem."
          : "Niski profil ryzyka, zachowaj zwykłą ostrożność.",
      source: "heuristic"
    }
  }
}
