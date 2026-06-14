import { analyzeSender } from "../src/shared/mailGuard/senderHeuristics"

describe("analyzeSender", () => {
  it("clean sender: no signals, no flags", () => {
    const v = analyzeSender({
      displayName: "Allegro",
      address: "noreply@allegro.pl"
    })
    expect(v.signals).toHaveLength(0)
    expect(v.lookalikeBrand).toBeNull()
    expect(v.displayNameSpoof).toBe(false)
    expect(v.replyToMismatch).toBe(false)
    expect(v.senderDomain).toBe("allegro.pl")
  })

  it("clean sender on subdomain: official domain not flagged", () => {
    const v = analyzeSender({
      displayName: "PayPal",
      address: "service@email.paypal.com"
    })
    expect(v.signals).toHaveLength(0)
    expect(v.displayNameSpoof).toBe(false)
    expect(v.lookalikeBrand).toBeNull()
    expect(v.senderDomain).toBe("paypal.com")
  })

  it("display-name spoof: PayPal display + foreign domain", () => {
    const v = analyzeSender({
      displayName: "PayPal Obsługa",
      address: "noreply@bezpieczne-konto.tk"
    })
    expect(v.displayNameSpoof).toBe(true)
    expect(v.lookalikeBrand).toBe("paypal")
    expect(v.signals.some((s) => s.id === "display-name-spoof")).toBe(true)
    const spoof = v.signals.find((s) => s.id === "display-name-spoof")!
    expect(spoof.weight).toBe(60)
  })

  it("homoglyph sender domain: paypa1.com", () => {
    const v = analyzeSender({
      displayName: "Konto",
      address: "alert@paypa1.com"
    })
    expect(v.senderDomain).toBe("paypa1.com")
    expect(v.lookalikeBrand).toBe("paypal")
    const sig = v.signals.find((s) => s.id === "sender-brand-homoglyph")
    expect(sig).toBeDefined()
    expect(sig!.weight).toBe(55)
  })

  it("brand embedded in foreign registrable domain: paypal-secure.tk", () => {
    const v = analyzeSender({
      displayName: "Wsparcie",
      address: "noreply@paypal-secure.tk"
    })
    expect(v.senderDomain).toBe("paypal-secure.tk")
    expect(v.lookalikeBrand).toBe("paypal")
    expect(v.signals.some((s) => s.id === "sender-brand-in-domain")).toBe(true)
  })

  it("reply-to mismatch", () => {
    const v = analyzeSender({
      displayName: "Jan Kowalski",
      address: "jan@firma.pl",
      replyTo: "payments@inne-konto.ru"
    })
    expect(v.replyToMismatch).toBe(true)
    const sig = v.signals.find((s) => s.id === "reply-to-mismatch")
    expect(sig).toBeDefined()
    expect(sig!.weight).toBe(45)
    expect(sig!.reason).toContain("inne-konto.ru")
    expect(sig!.reason).toContain("firma.pl")
  })

  it("reply-to same registrable domain: no mismatch", () => {
    const v = analyzeSender({
      displayName: "Jan",
      address: "jan@firma.pl",
      replyTo: "biuro@mail.firma.pl"
    })
    expect(v.replyToMismatch).toBe(false)
    expect(v.signals).toHaveLength(0)
  })

  it("freemail-as-brand: brand display + gmail address", () => {
    const v = analyzeSender({
      displayName: "Allegro Obsługa Klienta",
      address: "allegro.support2024@gmail.com"
    })
    expect(v.senderDomain).toBe("gmail.com")
    expect(v.signals.some((s) => s.id === "freemail-as-brand")).toBe(true)
    const sig = v.signals.find((s) => s.id === "freemail-as-brand")!
    expect(sig.weight).toBe(35)
    // Also a display-name spoof since freemail !== brand domain.
    expect(v.displayNameSpoof).toBe(true)
    expect(v.lookalikeBrand).toBe("allegro")
  })

  it("dmarc fail produces auth signal", () => {
    const v = analyzeSender({
      displayName: "Bank",
      address: "info@some-domain.pl",
      auth: { dmarc: "fail" }
    })
    const sig = v.signals.find((s) => s.id === "auth-dmarc-dkim-fail")
    expect(sig).toBeDefined()
    expect(sig!.weight).toBe(40)
  })

  it("spf softfail produces lower-weight signal", () => {
    const v = analyzeSender({
      displayName: "Bank",
      address: "info@some-domain.pl",
      auth: { spf: "softfail" }
    })
    const sig = v.signals.find((s) => s.id === "auth-spf-fail")
    expect(sig).toBeDefined()
    expect(sig!.weight).toBe(25)
  })

  it("auth unknown/none/undefined produces no signal", () => {
    const v = analyzeSender({
      displayName: "Bank",
      address: "info@some-domain.pl",
      auth: { spf: "unknown", dkim: "none", dmarc: "neutral" }
    })
    expect(v.signals).toHaveLength(0)
  })

  it("signals are sorted descending by weight", () => {
    // display-name spoof (60) + dmarc fail (40) + reply-to (45) + freemail (35)
    const v = analyzeSender({
      displayName: "PayPal",
      address: "support@gmail.com",
      replyTo: "cash@evil.ru",
      auth: { dmarc: "fail", spf: "fail" }
    })
    const weights = v.signals.map((s) => s.weight)
    const sorted = [...weights].sort((a, b) => b - a)
    expect(weights).toEqual(sorted)
    expect(weights.length).toBeGreaterThan(1)
    expect(weights[0]).toBe(60)
  })
})
