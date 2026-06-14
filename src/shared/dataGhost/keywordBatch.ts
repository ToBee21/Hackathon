// src/shared/dataGhost/keywordBatch.ts
//
// Czysta, testowalna logika doboru fraz dla jednego cyklu szumu DataGhost.
// Gdy użytkownik aktywował Wirtualną Tożsamość, jego zainteresowania trafiają tu
// jako `selectedTopics` i PRZECHYLAJĄ dobór kategorii w swoją stronę — DataGhost
// aktywnie buduje wybrany, fałszywy profil zamiast neutralnego szumu.
//
// Jednocześnie zostawiamy domieszkę losowych kategorii (1 − SELECTED_BIAS) oraz
// unikamy powtórzeń kategorii i fraz pod rząd, żeby ruch nie układał się w
// powtarzalny wzorzec łatwy do odfiltrowania przez telemetrię.

import { ALL_CATEGORIES, isKnownCategory, KEYWORD_POOL } from "./keywordPool"

export interface KeywordPick {
  keyword: string
  category: string
}

/** Udział slotów ciągniętych z wybranych zainteresowań (reszta z pełnej puli). */
export const SELECTED_BIAS = 0.7

type Rng = () => number

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Odsiewa nieznane/niepoprawne kategorie z listy zainteresowań. */
export function sanitizeTopics(topics: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(topics)) return []
  const seen = new Set<string>()
  for (const t of topics) {
    if (typeof t === "string" && isKnownCategory(t)) seen.add(t)
  }
  return [...seen]
}

/**
 * Wybiera kategorię dla pojedynczego slotu: z prawdopodobieństwem SELECTED_BIAS
 * z puli wybranych zainteresowań, inaczej z pełnej puli kategorii. `avoid`
 * pozwala ominąć kategorię poprzedniego slotu (bez powtórek pod rząd).
 */
function pickCategory(selected: string[], rng: Rng, avoid?: string): string {
  const useSelected = selected.length > 0 && rng() < SELECTED_BIAS
  const source = useSelected ? selected : ALL_CATEGORIES
  let category = pick(source, rng)
  // Jedna próba ominięcia powtórki — przy 1-elementowej puli zostawiamy jak jest.
  if (category === avoid && source.length > 1) {
    category = pick(source, rng)
  }
  return category
}

/**
 * Buduje listę `count` fraz na jeden cykl. Frazy nie powtarzają się w obrębie
 * batcha (gdy to możliwe), a kolejne sloty unikają tej samej kategorii pod rząd.
 *
 * @param count          ile zapytań w cyklu
 * @param selectedTopics zainteresowania z Wirtualnej Tożsamości (mogą być puste)
 * @param rng            źródło losowości (domyślnie Math.random — wstrzykiwalne w testach)
 */
export function buildKeywordBatchCore(
  count: number,
  selectedTopics: readonly string[] = [],
  rng: Rng = Math.random
): KeywordPick[] {
  const selected = sanitizeTopics(selectedTopics)
  const batch: KeywordPick[] = []
  const usedKeywords = new Set<string>()
  let prevCategory: string | undefined

  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    const category = pickCategory(selected, rng, prevCategory)
    const words = KEYWORD_POOL[category] ?? []
    if (words.length === 0) continue

    // Do kilku prób, by nie powtórzyć dokładnie tej samej frazy w batchu.
    let keyword = pick(words, rng)
    for (let attempt = 0; attempt < 4 && usedKeywords.has(keyword); attempt++) {
      keyword = pick(words, rng)
    }

    usedKeywords.add(keyword)
    prevCategory = category
    batch.push({ keyword, category })
  }

  return batch
}
