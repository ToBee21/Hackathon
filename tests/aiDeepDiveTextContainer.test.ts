import { scoreTextRootCandidate } from "../src/content/aiDeepDive/extractVisibleText"

describe("AI Deep-Dive visible text root ranking", () => {
  it("prefers Onet article body over a longer noisy main container", () => {
    const articleBody = scoreTextRootCandidate({
      selector: '[class*="article-body"]',
      textLength: 4200,
      paragraphCount: 12,
      linkTextLength: 120
    })
    const noisyMain = scoreTextRootCandidate({
      selector: "main",
      textLength: 6800,
      paragraphCount: 13,
      linkTextLength: 2600
    })

    expect(articleBody).toBeGreaterThan(noisyMain)
  })

  it("keeps listing pages parseable when no article body exists", () => {
    const listingMain = scoreTextRootCandidate({
      selector: "main",
      textLength: 9000,
      paragraphCount: 20,
      linkTextLength: 3200
    })
    const emptyArticle = scoreTextRootCandidate({
      selector: "article",
      textLength: 0,
      paragraphCount: 0,
      linkTextLength: 0
    })

    expect(listingMain).toBeGreaterThan(emptyArticle)
  })
})
