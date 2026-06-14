// tests/pdfInspect.test.ts
// vitest GLOBALS — describe/it/expect są globalne, nie importujemy ich.
import { inspectPdf } from "../src/shared/fileInspect/pdfInspect"

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

describe("inspectPdf", () => {
  it("non-PDF → isPdf false, brak sygnałów, wszystkie flagi false", () => {
    const r = inspectPdf(enc("To jest zwykły tekst, nie PDF /Launch /JavaScript"))
    expect(r.isPdf).toBe(false)
    expect(r.signals).toEqual([])
    expect(r.hasLaunch).toBe(false)
    expect(r.hasJavaScript).toBe(false)
    expect(r.hasOpenAction).toBe(false)
    expect(r.hasEmbeddedFile).toBe(false)
    expect(r.hasUriActions).toBe(false)
    expect(r.hasAcroForm).toBe(false)
    expect(r.encrypted).toBe(false)
  })

  it("czysty PDF bez niebezpiecznych tokenów → isPdf true, brak sygnałów", () => {
    const r = inspectPdf(enc("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF"))
    expect(r.isPdf).toBe(true)
    expect(r.signals).toEqual([])
    expect(r.hasLaunch).toBe(false)
    expect(r.hasJavaScript).toBe(false)
    expect(r.encrypted).toBe(false)
  })

  it("PDF z /JavaScript i /OpenAction → obie flagi + sygnały", () => {
    const r = inspectPdf(enc("%PDF-1.5\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>"))
    expect(r.isPdf).toBe(true)
    expect(r.hasJavaScript).toBe(true)
    expect(r.hasOpenAction).toBe(true)
    const ids = r.signals.map((s) => s.id)
    expect(ids).toContain("pdf-javascript")
    expect(ids).toContain("pdf-openaction")
  })

  it("/JS (bez /JavaScript) też ustawia hasJavaScript", () => {
    const r = inspectPdf(enc("%PDF-1.4\n<< /S /JavaScript /JS (x) >>".replace("/JavaScript ", "")))
    expect(r.isPdf).toBe(true)
    expect(r.hasJavaScript).toBe(true)
  })

  it("/AA (bez /OpenAction) też ustawia hasOpenAction", () => {
    const r = inspectPdf(enc("%PDF-1.4\n<< /AA << /O << /S /Named >> >> >>"))
    expect(r.hasOpenAction).toBe(true)
    expect(r.signals.map((s) => s.id)).toContain("pdf-openaction")
  })

  it("PDF z /Launch → najwyższa waga, posortowany pierwszy", () => {
    const r = inspectPdf(
      enc("%PDF-1.4\n<< /AcroForm 1 >> /URI (http://x) /Launch (cmd.exe) /OpenAction 2")
    )
    expect(r.hasLaunch).toBe(true)
    expect(r.signals[0].id).toBe("pdf-launch")
    expect(r.signals[0].weight).toBe(75)
  })

  it("PDF z /EmbeddedFile → flaga + sygnał", () => {
    const r = inspectPdf(enc("%PDF-1.7\n<< /Type /Filespec /EF << /F 1 0 R >> /EmbeddedFile >>"))
    expect(r.hasEmbeddedFile).toBe(true)
    const sig = r.signals.find((s) => s.id === "pdf-embedded")
    expect(sig).toBeDefined()
    expect(sig?.weight).toBe(40)
  })

  it("PDF z /Encrypt → encrypted true + sygnał", () => {
    const r = inspectPdf(enc("%PDF-1.6\ntrailer\n<< /Encrypt 5 0 R /Root 1 0 R >>"))
    expect(r.encrypted).toBe(true)
    expect(r.signals.map((s) => s.id)).toContain("pdf-encrypted")
  })

  it("sygnały posortowane malejąco po wadze", () => {
    const r = inspectPdf(
      enc(
        "%PDF-1.4\n/Launch /JavaScript /OpenAction /EmbeddedFile /AcroForm /URI /Encrypt"
      )
    )
    const weights = r.signals.map((s) => s.weight)
    const sorted = [...weights].sort((a, b) => b - a)
    expect(weights).toEqual(sorted)
    // pełny zestaw tokenów → 7 sygnałów
    expect(r.signals.length).toBe(7)
    expect(weights).toEqual([75, 60, 45, 40, 25, 20, 15])
  })
})
