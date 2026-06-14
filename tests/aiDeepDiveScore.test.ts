import { classifyHeuristic } from "../src/shared/aiDeepDive/score"
import { shouldShowAiDeepDiveNotification } from "../src/shared/aiDeepDive/reportPolicy"

const baseInput = {
  title: "",
  meta: "",
  headings: "",
  body: "",
  origin: "https://example.test",
  path: "/article?utm_source=test"
}

describe("AI Deep-Dive heuristic scoring", () => {
  it("keeps a benign gardening article low risk", () => {
    const result = classifyHeuristic({
      ...baseInput,
      title: "Urban gardening guide",
      headings: "Balcony tomatoes and soil schedule",
      body: `
        Article about urban gardening, tomatoes, balcony soil, compost,
        watering schedules, sunlight and container herbs.
      `
    })

    expect(result.level).toBe("low")
    expect(result.score).toBeLessThan(25)
    expect(result.rawTextRetained).toBe(false)
  })

  it("flags mental health and debt distress as high or critical", () => {
    const result = classifyHeuristic({
      ...baseInput,
      title: "Urgent support for depression and unpaid debt",
      headings: "Eviction fear, financial hardship, crisis support",
      body: `
        Guide for people dealing with depression symptoms, suicidal thoughts,
        unpaid debt, eviction fear, bankruptcy risk, urgent financial hardship,
        therapy support and crisis helplines.
      `
    })

    expect(["high", "critical"]).toContain(result.level)
    expect(result.score).toBeGreaterThanOrEqual(55)
    expect(result.categories.map((entry) => entry.category)).toContain("mental_health")
    expect(result.categories.map((entry) => entry.category)).toContain("financial_distress")
    expect(result.evidenceTags).toContain("depression_terms")
    expect(result.evidenceTags).toContain("debt_terms")
  })

  it("flags political radicalization content as high risk", () => {
    const result = classifyHeuristic({
      ...baseInput,
      title: "Extremist ideology and recruitment narratives",
      headings: "Radicalization forums and violent movement symbolism",
      body: `
        Forum discussion about extremist ideology, political radicalization,
        recruitment narratives, violent movement symbolism, propaganda,
        militia cells and dehumanizing rhetoric.
      `
    })

    expect(["high", "critical"]).toContain(result.level)
    expect(result.score).toBeGreaterThanOrEqual(55)
    expect(result.categories.map((entry) => entry.category)).toContain("politics_extreme")
  })

  it("flags Polish Onet-style mental health columns", () => {
    const result = classifyHeuristic({
      ...baseInput,
      title: "Justyna Nagłowska dla Onetu: czasem życie zatrzymuje nas za nas [FELIETON]",
      headings: "Psychologia. Żona aktora i ona ma depresję",
      body: `
        Była złość, wkurzenie i rozpacz. Pojawił się ból, bezradność
        i poczucie, że nie mam już gdzie uciec przed samą sobą.
        Tekst opisuje depresję, kryzys psychiczny i potrzebę pomocy.
      `
    })

    expect(["high", "critical"]).toContain(result.level)
    expect(result.categories.map((entry) => entry.category)).toContain("mental_health")
  })

  it("keeps Polish religion columns visible as sensitive context", () => {
    const result = classifyHeuristic({
      ...baseInput,
      title: "Kościół pokrzywdzony [FELIETON]",
      headings: "Religia, księża i kryzys wiary",
      body: `
        Felieton opisuje Kościół, księży, ofiary komunizmu,
        pomówienia i wiarygodne oczyszczenie z zarzutów.
      `
    })

    expect(["medium", "high", "critical"]).toContain(result.level)
    expect(result.categories.map((entry) => entry.category)).toContain("religion")
  })

  it("URL/host topic signal sharpens the detected category", () => {
    const result = classifyHeuristic({
      ...baseInput,
      origin: "https://zwierciadlo.pl",
      path: "/psychologia/depresja-objawy",
      title: "Nieoczywiste objawy, które warto znać",
      body: "Krótki wstęp redakcyjny do tematu."
    })

    // Sama sekcja adresu (psychologia/depresja) wystarcza, by trafnie wskazać
    // zdrowie psychiczne jako temat strony.
    expect(result.categories[0]?.category).toBe("mental_health")
  })

  it("nieco ostrzej: wyraźnie wrażliwy temat przekracza próg powiadomienia", () => {
    const result = classifyHeuristic({
      ...baseInput,
      origin: "https://portal.example",
      path: "/zdrowie/depresja",
      title: "Jak rozpoznać depresję u bliskiej osoby",
      headings: "Objawy depresji na co dzień",
      body: "Artykuł opisuje depresję i jej wpływ na codzienne życie."
    })

    expect(["high", "critical"]).toContain(result.level)
    expect(shouldShowAiDeepDiveNotification(result)).toBe(true)
    expect(result.categories[0]?.category).toBe("mental_health")
  })

  it("wyważenie: pojedyncza, poboczna wzmianka nie wywołuje powiadomienia", () => {
    const result = classifyHeuristic({
      ...baseInput,
      origin: "https://blog.example",
      path: "/kuchnia/zupa-pomidorowa",
      title: "Przepis na zupę pomidorową",
      body: "Lekki artykuł kulinarny; pada słowo szpital tylko raz, mimochodem."
    })

    expect(["low", "medium"]).toContain(result.level)
    expect(shouldShowAiDeepDiveNotification(result)).toBe(false)
  })

  it("does not trigger max-camo levels for generic mixed policy news", () => {
    const result = classifyHeuristic({
      ...baseInput,
      title: "Healthcare policy and election debate",
      headings: "Parliamentary proposal changes public insurance rules",
      body: `
        Opinion article mentioning healthcare policy and elections without
        personal symptoms, crisis language, identity targeting, extremist
        framing, debt distress, addiction or legal trouble.
      `
    })

    expect(result.score).toBeLessThan(55)
    expect(["low", "medium"]).toContain(result.level)
  })
})
