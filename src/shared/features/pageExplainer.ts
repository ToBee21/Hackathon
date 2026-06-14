// src/shared/features/pageExplainer.ts
// Feature B — Contextual Page Explainer. Pure local heuristic over page context
// (title / OG / headings / forms). No model call, so its card is honestly tagged
// source: "static". Explains what the page is and the data-exposure surface.

import type { Feature } from "../featureRegistry"

export const pageExplainer: Feature = {
  featureId: "page-explainer",
  title: "Co to za strona",
  shortDescription: "Krótkie streszczenie strony i powierzchni ryzyka danych.",
  riskLevel: "info",
  requiredCapabilities: ["page-text"],
  activation: (page) => !page.excluded && (page.title.length > 0 || page.headings.length > 0),
  run: ({ page }) => {
    const subject =
      page.og.title || page.title || page.headings[0] || "Nieznana strona"
    const lines: string[] = [subject]

    const summary = page.og.description || page.meta
    if (summary) lines.push(summary.slice(0, 180))

    const exposure: string[] = []
    if (page.hasPasswordField) exposure.push("pola logowania/hasła")
    if (page.hasForms) exposure.push("formularze")
    if (page.hasConsentBanner) exposure.push("baner zgody/cookies")
    if (exposure.length > 0) {
      lines.push(`Powierzchnia danych: ${exposure.join(", ")}.`)
    }

    return {
      featureId: "page-explainer",
      title: "Co to za strona",
      level: "info",
      lines,
      action: page.hasPasswordField
        ? "Strona z logowaniem — skanowanie ograniczone, treść nieczytana."
        : undefined,
      source: "static"
    }
  }
}
