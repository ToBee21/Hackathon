// src/shared/features/dataFootprintFeature.ts
// Feature — Data Footprint (Ślad danych). Pokazuje, o jakie kategorie danych
// osobowych prosi formularz na bieżącej stronie (e-mail, telefon, adres, data
// urodzenia, dokument tożsamości, dane karty) i jak „głodna danych" jest strona.
//
// Zgodnie z kontraktem registry: feature NIE robi I/O — czyta tylko sesyjny
// snapshot z dataFootprintState (zasilany METADANYMI pól przez content layer,
// NIGDY wartościami). Zero sieci, w 100% lokalnie.

import type { CardLevel, Feature, FeatureCard } from "../featureRegistry"
import { getDataFootprint } from "../dataFootprint/dataFootprintState"
import type {
  DataFootprintLevel,
  PiiCategory
} from "../dataFootprint/piiFieldHeuristics"

const CATEGORY_LABEL: Record<PiiCategory, string> = {
  payment: "dane karty płatniczej",
  gov_id: "dokument tożsamości",
  dob: "data urodzenia",
  postal: "adres",
  phone: "telefon",
  email: "e-mail",
  name: "imię i nazwisko",
  password: "hasło"
}

function toCardLevel(level: DataFootprintLevel): CardLevel {
  // "low" | "medium" | "high" | "critical" are all valid CardLevel values.
  return level
}

export const dataFootprintFeature: Feature = {
  featureId: "data-footprint",
  title: "Ślad danych",
  shortDescription:
    "Pokazuje, o jakie dane osobowe prosi ta strona — lokalnie, bez czytania wartości pól.",
  riskLevel: "medium",
  requiredCapabilities: [],
  // Działa na każdej zwykłej (niewykluczonej) stronie.
  activation: (page) => !page.excluded,
  run: (): FeatureCard | null => {
    const fp = getDataFootprint()
    // Nic wrażliwego nie wykryto → nie zaśmiecaj panelu.
    if (fp.categories.length === 0) return null

    const labels = fp.categories.map((c) => CATEGORY_LABEL[c])
    const lines: string[] = [
      `Ta strona prosi o: ${labels.join(", ")}.`,
      `${fp.sensitiveFieldCount} ${plural(
        fp.sensitiveFieldCount,
        "wrażliwe pole",
        "wrażliwe pola",
        "wrażliwych pól"
      )} z ${fp.totalFieldCount} w formularzach.`
    ]

    const action =
      fp.level === "critical" || fp.level === "high"
        ? "Dużo danych osobowych naraz. Rozważ alias e-mail i podaj tylko to, co konieczne."
        : "Podaj tylko dane wymagane gwiazdką; resztę możesz pominąć."

    return {
      featureId: "data-footprint",
      title: "Ślad danych",
      level: toCardLevel(fp.level),
      score: fp.score,
      lines,
      evidence: labels.slice(0, 4),
      action,
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
