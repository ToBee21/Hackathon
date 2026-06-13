import { classifyHeuristic } from "../src/shared/aiDeepDive/score"

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
