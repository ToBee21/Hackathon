import {
  buildKeywordBatchCore,
  sanitizeTopics,
  SELECTED_BIAS
} from "../src/shared/dataGhost/keywordBatch"
import { ALL_CATEGORIES, isKnownCategory, KEYWORD_POOL } from "../src/shared/dataGhost/keywordPool"

/** Deterministyczne RNG (LCG) do powtarzalnych testów. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

describe("DataGhost — rozszerzona baza fraz", () => {
  it("każda kategoria ma sporą, zróżnicowaną pulę (anty-wzorzec)", () => {
    for (const cat of ALL_CATEGORIES) {
      const words = KEYWORD_POOL[cat]
      expect(words.length).toBeGreaterThanOrEqual(10)
      // Bez duplikatów wewnątrz kategorii.
      expect(new Set(words).size).toBe(words.length)
    }
  })

  it("łącznie udostępnia dużą liczbę unikalnych fraz", () => {
    const all = ALL_CATEGORIES.flatMap((c) => KEYWORD_POOL[c])
    expect(all.length).toBeGreaterThan(250)
    expect(new Set(all).size).toBe(all.length)
  })
})

describe("DataGhost — sanitizeTopics", () => {
  it("odsiewa nieznane kategorie i deduplikuje", () => {
    expect(sanitizeTopics(["finance", "finance", "bogus", "travel"])).toEqual([
      "finance",
      "travel"
    ])
    expect(sanitizeTopics(null)).toEqual([])
    expect(sanitizeTopics(["nope"]).every(isKnownCategory)).toBe(true)
  })
})

describe("DataGhost — dobór ważony zainteresowaniami", () => {
  it("bez wyboru korzysta z pełnej puli i nie powtarza kategorii pod rząd", () => {
    const batch = buildKeywordBatchCore(20, [], seededRng(42))
    expect(batch.length).toBe(20)
    for (const { category } of batch) expect(isKnownCategory(category)).toBe(true)
    for (let i = 1; i < batch.length; i++) {
      expect(batch[i].category).not.toBe(batch[i - 1].category)
    }
  })

  it("przechyla większość zapytań w stronę wybranych zainteresowań", () => {
    const selected = ["finance", "travel"]
    const batch = buildKeywordBatchCore(200, selected, seededRng(7))
    const inSelected = batch.filter((b) => selected.includes(b.category)).length
    const ratio = inSelected / batch.length
    // Oczekiwany udział ~SELECTED_BIAS; dopuszczamy margines wokół wartości.
    expect(ratio).toBeGreaterThan(SELECTED_BIAS - 0.15)
    // Zostaje też domieszka spoza wyboru — brak sztywnego wzorca.
    expect(inSelected).toBeLessThan(batch.length)
  })

  it("nie powtarza dokładnie tej samej frazy gdy pula na to pozwala", () => {
    const batch = buildKeywordBatchCore(8, ["technology"], seededRng(99))
    const keywords = batch.map((b) => b.keyword)
    // technology ma >8 fraz, więc batch 8 powinien być bez powtórek.
    expect(new Set(keywords).size).toBe(keywords.length)
  })

  it("ignoruje nieprawidłowe tematy i wraca do pełnej puli", () => {
    const batch = buildKeywordBatchCore(10, ["bogus", "alsoNope"], seededRng(3))
    expect(batch.length).toBe(10)
    for (const { category } of batch) expect(isKnownCategory(category)).toBe(true)
  })
})
