import { analyzeAttachment } from "../src/shared/mailGuard/attachmentMetadataRisk"

describe("analyzeAttachment (Stage 0 — metadata only)", () => {
  it("treats a clean PDF as archetype 'none' with no signals", () => {
    const verdict = analyzeAttachment({
      filename: "raport.pdf",
      mime: "application/pdf"
    })
    expect(verdict.archetype).toBe("none")
    expect(verdict.signals).toHaveLength(0)
    expect(verdict.effectiveExtension).toBe("pdf")
  })

  it("flags a double extension (faktura.pdf.exe) as 'double-extension', high signal", () => {
    const verdict = analyzeAttachment({ filename: "Faktura.pdf.exe" })
    expect(verdict.archetype).toBe("double-extension")
    expect(verdict.effectiveExtension).toBe("exe")
    const sig = verdict.signals.find((s) => s.id === "att.double-extension")
    expect(sig).toBeDefined()
    expect(sig!.weight).toBeGreaterThanOrEqual(70)
    expect(sig!.reason).toMatch(/pdf/)
    expect(sig!.reason).toMatch(/exe/)
    // double-extension must NOT also be reported as a plain executable.
    expect(verdict.signals.find((s) => s.id === "att.executable")).toBeUndefined()
  })

  it("flags a single executable (.scr) as 'executable'", () => {
    const verdict = analyzeAttachment({ filename: "cv.scr" })
    expect(verdict.archetype).toBe("executable")
    expect(verdict.effectiveExtension).toBe("scr")
    const sig = verdict.signals.find((s) => s.id === "att.executable")
    expect(sig).toBeDefined()
    expect(sig!.weight).toBeGreaterThanOrEqual(60)
  })

  it("flags a macro document (.docm) as 'macro'", () => {
    const verdict = analyzeAttachment({ filename: "umowa.docm" })
    expect(verdict.archetype).toBe("macro")
    expect(verdict.effectiveExtension).toBe("docm")
    const sig = verdict.signals.find((s) => s.id === "att.macro")
    expect(sig).toBeDefined()
    expect(sig!.reason).toMatch(/makr/i)
  })

  it("flags HTML as 'smuggling' and mentions HTML smuggling", () => {
    const verdict = analyzeAttachment({ filename: "invoice.html" })
    expect(verdict.archetype).toBe("smuggling")
    expect(verdict.effectiveExtension).toBe("html")
    const sig = verdict.signals.find((s) => s.id === "att.smuggling")
    expect(sig).toBeDefined()
    expect(sig!.reason).toMatch(/HTML smuggling/i)
  })

  it("flags ISO as 'smuggling' and mentions SmartScreen/MOTW", () => {
    const verdict = analyzeAttachment({ filename: "package.iso" })
    expect(verdict.archetype).toBe("smuggling")
    expect(verdict.effectiveExtension).toBe("iso")
    const sig = verdict.signals.find((s) => s.id === "att.smuggling")
    expect(sig).toBeDefined()
    expect(sig!.reason).toMatch(/SmartScreen|MOTW/i)
  })

  it("treats a lone ZIP as 'archive' with a single moderate signal", () => {
    const verdict = analyzeAttachment({ filename: "dokumenty.zip" })
    expect(verdict.archetype).toBe("archive")
    expect(verdict.effectiveExtension).toBe("zip")
    expect(verdict.signals.find((s) => s.id === "att.archive")).toBeDefined()
    expect(verdict.signals.find((s) => s.id === "att.archive-password")).toBeUndefined()
  })

  it("raises the ZIP signal when a password tell ('hasło: 1234') is in the body", () => {
    const verdict = analyzeAttachment(
      { filename: "dokumenty.zip" },
      "Załączam pliki. Hasło: 1234"
    )
    expect(verdict.archetype).toBe("archive")
    const pw = verdict.signals.find((s) => s.id === "att.archive-password")
    expect(pw).toBeDefined()
    expect(pw!.reason).toMatch(/skaner/i)
    // The lone-archive base signal is still present too.
    expect(verdict.signals.find((s) => s.id === "att.archive")).toBeDefined()
  })

  it("detects English 'password' tell in the body too", () => {
    const verdict = analyzeAttachment(
      { filename: "files.rar" },
      "The password is hunter2"
    )
    expect(verdict.signals.find((s) => s.id === "att.archive-password")).toBeDefined()
  })

  it("flags a MIME mismatch (pdf extension but x-msdownload MIME)", () => {
    const verdict = analyzeAttachment({
      filename: "raport.pdf",
      mime: "application/x-msdownload"
    })
    expect(verdict.effectiveExtension).toBe("pdf")
    const sig = verdict.signals.find((s) => s.id === "att.mime-mismatch")
    expect(sig).toBeDefined()
    expect(sig!.weight).toBe(40)
  })

  it("computes effectiveExtension as the LAST token after normalization", () => {
    expect(analyzeAttachment({ filename: "  Archive.Final.TAR.GZ  " }).effectiveExtension).toBe("gz")
    expect(analyzeAttachment({ filename: "no-extension" }).effectiveExtension).toBe("")
    expect(analyzeAttachment({ filename: "report.PDF" }).effectiveExtension).toBe("pdf")
  })

  it("returns signals sorted descending by weight", () => {
    // ZIP (30) + password (35) → must come out 35 then 30.
    const verdict = analyzeAttachment(
      { filename: "secret.zip" },
      "hasło do archiwum: abc"
    )
    expect(verdict.signals.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < verdict.signals.length; i += 1) {
      expect(verdict.signals[i - 1].weight).toBeGreaterThanOrEqual(verdict.signals[i].weight)
    }
    expect(verdict.signals[0].weight).toBe(35)
  })

  it("applies archetype precedence: double-extension over everything", () => {
    // .docm.exe — macro-looking preceding token, executable final.
    const verdict = analyzeAttachment({ filename: "umowa.docm.exe" })
    expect(verdict.archetype).toBe("double-extension")
    expect(verdict.effectiveExtension).toBe("exe")
  })
})
