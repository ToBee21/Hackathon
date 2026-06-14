// src/shared/features/linkGuardFeature.ts
// Feature — Link Guard. Pokazuje w panelu floating podsumowanie lokalnej,
// zero-network ochrony linków: ile linków sprawdzono na hover, ile oznaczono
// jako wysokie ryzyko, ile kliknięć przeszło przez bramkę — oraz JAWNY licznik
// połączeń sieciowych (zawsze 0), który jest dowodem na analizę w pełni lokalną.
//
// Zgodnie z kontraktem registry: feature NIE robi własnego I/O — czyta tylko
// sesyjny snapshot z linkGuardState (zasilany przez warstwę content/linkGuard).

import type { CardLevel, Feature, FeatureCard } from "../featureRegistry"
import { getLinkGuardStats } from "../linkSafety/linkGuardState"
import type { LinkRiskLevel } from "../linkSafety/urlHeuristics"

function toCardLevel(level: LinkRiskLevel): CardLevel {
  if (level === "critical" || level === "high" || level === "medium") return level
  return "low"
}

export const linkGuardFeature: Feature = {
  featureId: "link-guard",
  title: "Link Guard",
  shortDescription:
    "Lokalna ocena bezpieczeństwa linków na hover + bramka kliknięcia. Zero sieci.",
  riskLevel: "high",
  requiredCapabilities: [],
  // Ochrona linków działa na każdej zwykłej stronie.
  activation: (page) => !page.excluded,
  run: (): FeatureCard | null => {
    const s = getLinkGuardStats()

    const last = s.lastVerdict
    const level: CardLevel =
      s.highRiskFlagged > 0 && last ? toCardLevel(last.level) : "low"

    const lines: string[] = [
      `Sprawdzono ${s.linksScanned} ${plural(s.linksScanned, "link", "linki", "linków")} na hover, ${s.networkCalls} połączeń sieciowych — analiza w 100% lokalna.`
    ]
    if (s.highRiskFlagged > 0) {
      lines.push(
        `Oznaczono ${s.highRiskFlagged} ${plural(s.highRiskFlagged, "link", "linki", "linków")} wysokiego ryzyka; bramka wstrzymała ${s.clicksGated} ${plural(s.clicksGated, "kliknięcie", "kliknięcia", "kliknięć")}.`
      )
    }
    if (s.clicksBlocked > 0 || s.clicksOverridden > 0) {
      lines.push(
        `Twardo zablokowano: ${s.clicksBlocked}; świadomie przepuszczono: ${s.clicksOverridden}.`
      )
    }
    if (last) {
      lines.push(`Ostatni link: ${last.domain} — ${last.odds}% szansy, że bezpieczny.`)
    }

    return {
      featureId: "link-guard",
      title: "Link Guard",
      level,
      score: s.highRiskFlagged > 0 && last ? last.score : undefined,
      lines,
      action:
        s.highRiskFlagged > 0
          ? "Najedź na link, by zobaczyć powody; klik w ryzykowny link wymaga potwierdzenia."
          : "Najedź na dowolny link, by zobaczyć szansę, że jest bezpieczny.",
      source: "heuristic"
    }
  }
}

// Polska odmiana liczebnika (1 / 2-4 / 5+).
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (n === 1) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
