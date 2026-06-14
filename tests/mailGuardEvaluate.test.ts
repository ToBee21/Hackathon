import { evaluateMail, type MailEvidence } from "../src/shared/mailGuard/evaluate"
import { resetCampaigns } from "../src/shared/mailGuard/campaignFingerprint"

function clean(): MailEvidence {
  return {
    sender: { displayName: "Allegro", address: "noreply@allegro.pl" },
    attachments: [],
    bodyText: "Twoje zamówienie zostało wysłane. Dziękujemy za zakupy.",
    linkDomains: ["allegro.pl"]
  }
}

function bec(): MailEvidence {
  return {
    sender: {
      displayName: "Jan Kowalski",
      address: "jan.kowalski@firma.com",
      replyTo: "jan.kowalski@firma-payments.tk"
    },
    attachments: [],
    bodyText:
      "Pilne: zmieniliśmy numer konta. Proszę wykonać przelew na nowy rachunek wskazany w fakturze.",
    linkDomains: []
  }
}

function malware(): MailEvidence {
  return {
    sender: { displayName: "Księgowość", address: "biuro@kontrahent.com" },
    attachments: [{ filename: "Faktura_2026.docm", mime: "application/vnd.ms-word" }],
    bodyText: "W załączniku faktura. Włącz makra, aby zobaczyć treść.",
    linkDomains: []
  }
}

describe("MailGuard evaluate (agregator)", () => {
  beforeEach(() => resetCampaigns())

  it("czysty mail = niski poziom, brak archetypu", () => {
    const v = evaluateMail(clean(), 1000)
    expect(v.level).toBe("low")
    expect(v.archetype).toBe("unknown")
    expect(v.lookalikeBrand).toBeNull()
    expect(v.fingerprint).toMatch(/^cmp_[0-9a-f]{8}$/)
  })

  it("BEC: reply-to mismatch + zmiana numeru konta podnosi ryzyko", () => {
    const v = evaluateMail(bec(), 1000)
    expect(v.archetype).toBe("bec")
    expect(["high", "critical", "medium"]).toContain(v.level)
    expect(v.signals.some((s) => s.id.includes("reply") || s.reason.toLowerCase().includes("reply"))).toBe(true)
  })

  it("malware-delivery: makro w załączniku", () => {
    const v = evaluateMail(malware(), 1000)
    expect(v.archetype).toBe("malware-delivery")
    expect(v.score).toBeGreaterThanOrEqual(55)
    expect(v.signals.length).toBeGreaterThan(0)
  })

  it("repeat offender: drugie wystąpienie tego samego wzorca dokłada sygnał", () => {
    const first = evaluateMail(malware(), 1000)
    expect(first.repeatOffender).toBe(false)
    const second = evaluateMail(malware(), 2000)
    expect(second.repeatOffender).toBe(true)
    expect(second.seenCount).toBe(2)
    expect(second.signals.some((s) => s.id === "repeat-offender")).toBe(true)
    expect(second.score).toBeGreaterThanOrEqual(first.score)
  })

  it("ten sam wzorzec ataku => ten sam fingerprint", () => {
    const a = evaluateMail(malware(), 1000)
    resetCampaigns()
    const b = evaluateMail(malware(), 9999)
    expect(a.fingerprint).toBe(b.fingerprint)
  })

  it("signals posortowane malejąco wagą", () => {
    const v = evaluateMail(bec(), 1000)
    const w = v.signals.map((s) => s.weight)
    expect(w).toEqual([...w].sort((x, y) => y - x))
  })
})
