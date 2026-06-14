// tests/mailMoClassifier.test.ts
// Vitest globals (describe/it/expect) — bez importów testowych.

import { classifyMo } from "../src/shared/mailGuard/moClassifier"
import type {
  AttachmentArchetype,
  AttachmentVerdict,
  MoInput,
  SenderVerdict
} from "../src/shared/mailGuard/types"

function sender(over: Partial<SenderVerdict> = {}): SenderVerdict {
  return {
    signals: [],
    lookalikeBrand: null,
    displayNameSpoof: false,
    replyToMismatch: false,
    senderDomain: "example.com",
    ...over
  }
}

function attachment(archetype: AttachmentArchetype): AttachmentVerdict {
  return {
    signals: [],
    archetype,
    effectiveExtension: archetype === "macro" ? "docm" : "bin"
  }
}

function input(over: Partial<MoInput> = {}): MoInput {
  return {
    senderVerdict: sender(),
    attachmentVerdicts: [],
    bodyText: "",
    linkDomains: [],
    ...over
  }
}

describe("classifyMo", () => {
  it("wykrywa BEC: replyToMismatch + zmiana numeru konta", () => {
    const v = classifyMo(
      input({
        senderVerdict: sender({ replyToMismatch: true }),
        bodyText:
          "Prosimy o pilną zmianę numeru konta do przelewu faktury VAT."
      })
    )
    expect(v.archetype).toBe("bec")
    expect(v.confidence).toBeGreaterThan(0.4)
    expect(v.tells.some((t) => /Reply-To/.test(t))).toBe(true)
  })

  it("wykrywa malware-delivery: załącznik z makrami", () => {
    const v = classifyMo(
      input({
        attachmentVerdicts: [attachment("macro")],
        bodyText: "W załączeniu faktura, prosimy o otwarcie dokumentu."
      })
    )
    expect(v.archetype).toBe("malware-delivery")
    expect(v.tells.some((t) => /makra/i.test(t))).toBe(true)
  })

  it("wykrywa credential-phishing: obcy link + zweryfikuj konto", () => {
    const v = classifyMo(
      input({
        senderVerdict: sender({ senderDomain: "example.com" }),
        bodyText:
          "Twoje konto zostało zablokowane. Zweryfikuj konto, aby je odblokować.",
        linkDomains: ["paypa1-secure.tk"]
      })
    )
    expect(v.archetype).toBe("credential-phishing")
    expect(v.tells.some((t) => /obcej domeny/.test(t))).toBe(true)
  })

  it("wykrywa callback-scam: telefon + zadzwoń, bez linków i załączników", () => {
    const v = classifyMo(
      input({
        bodyText:
          "Wykryto nieautoryzowaną transakcję. Zadzwoń pod numer +48 600 700 800 natychmiast.",
        linkDomains: [],
        attachmentVerdicts: []
      })
    )
    expect(v.archetype).toBe("callback-scam")
    expect(v.tells.some((t) => /telefon/i.test(t))).toBe(true)
  })

  it("zwraca unknown przy braku sygnałów", () => {
    const v = classifyMo(input({ bodyText: "Dzień dobry, miłego dnia." }))
    expect(v.archetype).toBe("unknown")
    expect(v.confidence).toBeCloseTo(0.2, 5)
    expect(v.tells).toEqual(["Brak wyraźnego wzorca ataku."])
  })

  it("pewność rośnie monotonicznie z liczbą korroborujących sygnałów", () => {
    // Słabszy BEC: brak pilności, brak lookalike.
    const weak = classifyMo(
      input({
        senderVerdict: sender({ replyToMismatch: true }),
        bodyText: "Zmiana numeru konta do przelewu."
      })
    )
    // Silniejszy BEC: + lookalikeBrand + pilność.
    const strong = classifyMo(
      input({
        senderVerdict: sender({
          replyToMismatch: true,
          lookalikeBrand: "PayPal"
        }),
        bodyText:
          "PILNE: natychmiastowa zmiana numeru konta do przelewu faktury."
      })
    )
    expect(weak.archetype).toBe("bec")
    expect(strong.archetype).toBe("bec")
    expect(strong.confidence).toBeGreaterThan(weak.confidence)
    expect(strong.tells.length).toBeGreaterThan(weak.tells.length)
  })
})
