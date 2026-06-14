import {
  analyzeLink,
  registrableDomain
} from "../src/shared/linkSafety/urlHeuristics"

describe("Link Safety — registrableDomain", () => {
  it("zwraca eTLD+1 dla prostych domen", () => {
    expect(registrableDomain("accounts.google.com")).toBe("google.com")
    expect(registrableDomain("paypal.com")).toBe("paypal.com")
  })

  it("obsługuje złożone sufiksy publiczne", () => {
    expect(registrableDomain("sklep.allegro.com.pl")).toBe("allegro.com.pl")
    expect(registrableDomain("foo.bar.co.uk")).toBe("bar.co.uk")
  })
})

describe("Link Safety — analyzeLink", () => {
  it("pomija linki, których nie oceniamy", () => {
    expect(analyzeLink("")).toBeNull()
    expect(analyzeLink("#sekcja")).toBeNull()
    expect(analyzeLink("mailto:a@b.com")).toBeNull()
    expect(analyzeLink("tel:+48123")).toBeNull()
  })

  it("ocenia czysty link jako niski poziom z wysoką szansą bezpieczeństwa", () => {
    const v = analyzeLink("https://www.wikipedia.org/wiki/Bezpieczenstwo")
    expect(v).not.toBeNull()
    expect(v!.level).toBe("low")
    expect(v!.legitimacyOdds).toBeGreaterThanOrEqual(75)
    expect(v!.signals).toHaveLength(0)
  })

  it("NIE flaguje oficjalnej subdomeny marki", () => {
    const v = analyzeLink("https://accounts.google.com/signin")
    expect(v!.brandImpersonated).toBeNull()
    // 'signin' to słowo-wytrych, ale to legalna domena => co najwyżej medium.
    expect(v!.level === "low" || v!.level === "medium").toBe(true)
  })

  it("wykrywa markę wmontowaną w obcą domenę", () => {
    const v = analyzeLink("https://paypal-login.secure-update.com/verify")
    expect(v!.brandImpersonated).toBe("paypal")
    expect(["high", "critical"]).toContain(v!.level)
  })

  it("wykrywa markę tylko w subdomenie (prawdziwa domena inna)", () => {
    const v = analyzeLink("https://login.google.com.evil-host.ru/account")
    expect(v!.registrableDomain).toBe("evil-host.ru")
    expect(v!.brandImpersonated).toBe("google")
    expect(["high", "critical"]).toContain(v!.level)
  })

  it("wykrywa homoglify cyfrowe (paypa1 -> paypal)", () => {
    const v = analyzeLink("https://paypa1.com/login")
    expect(v!.brandImpersonated).toBe("paypal")
    expect(v!.signals.some((s) => s.id === "brand-homoglyph")).toBe(true)
  })

  it("flaguje userinfo '@' w URL", () => {
    const v = analyzeLink("https://google.com@phishy.tk/")
    expect(v!.signals.some((s) => s.id === "userinfo-at")).toBe(true)
    expect(v!.score).toBeGreaterThanOrEqual(55)
  })

  it("flaguje surowy host IP", () => {
    const v = analyzeLink("http://203.0.113.7/account/verify")
    expect(v!.signals.some((s) => s.id === "ip-host")).toBe(true)
  })

  it("flaguje rozjazd tekstu kotwicy z celem", () => {
    const v = analyzeLink("https://random-domain.xyz/go", {
      anchorText: "www.paypal.com"
    })
    expect(v!.signals.some((s) => s.id === "anchor-href-mismatch")).toBe(true)
    expect(["high", "critical"]).toContain(v!.level)
  })

  it("ocenia aktywne schematy jako wysokie ryzyko", () => {
    const v = analyzeLink("javascript:alert(document.cookie)")
    expect(v!.level).toBe("critical")
    expect(v!.signals.some((s) => s.id === "active-scheme")).toBe(true)
  })

  it("blokuje fake-installer download lure z podejrzanej domeny", () => {
    const v = analyzeLink("https://insecthoney.xyz/?affId=2905&o=519&title=SETUP%20FILE")
    expect(v).not.toBeNull()
    expect(["high", "critical"]).toContain(v!.level)
    expect(v!.signals.some((s) => s.id === "suspicious-tld")).toBe(true)
    expect(v!.signals.some((s) => s.id === "download-lure")).toBe(true)
  })

  it("flaguje punycode / IDN", () => {
    const v = analyzeLink("https://xn--pypal-4ve.com/login")
    expect(v!.signals.some((s) => s.id === "punycode-idn")).toBe(true)
  })

  it("score i legitimacyOdds zawsze sumują się do 100", () => {
    const v = analyzeLink("https://paypal-login.secure-update.tk/verify")
    expect(v!.score + v!.legitimacyOdds).toBe(100)
  })

  it("sortuje sygnały malejąco wagą", () => {
    const v = analyzeLink("https://paypal-login.tk@1.2.3.4/verify")
    const weights = v!.signals.map((s) => s.weight)
    expect(weights).toEqual([...weights].sort((a, b) => b - a))
  })
})
