// src/shared/dataFootprint/dataFootprintState.ts
// Sesyjny snapshot „śladu danych" bieżącej strony. Bez I/O i bez sieci — to tylko
// pamięć realmu content-scriptu. Pisze do niego content/dataFootprintScan.ts
// (skan METADANYCH pól formularzy), czyta dataFootprintFeature.ts (karta panelu).
//
// Privacy: trzymamy wyłącznie PODSUMOWANIE (kategorie + liczniki + score), nigdy
// wartości pól ani danych użytkownika.

import {
  emptyDataFootprint,
  type DataFootprintSummary
} from "./piiFieldHeuristics"

let current: DataFootprintSummary = emptyDataFootprint()

export function getDataFootprint(): Readonly<DataFootprintSummary> {
  return current
}

export function setDataFootprint(summary: DataFootprintSummary): void {
  current = summary
}

/** Tylko do testów / reset między stronami. */
export function resetDataFootprint(): void {
  current = emptyDataFootprint()
}
