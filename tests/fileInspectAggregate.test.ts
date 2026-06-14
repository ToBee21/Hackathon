import { inspectFileBytes } from "../src/shared/fileInspect/inspectFile"

const enc = new TextEncoder()

function bytesFrom(prefix: number[], text = ""): Uint8Array {
  const tail = enc.encode(text)
  const out = new Uint8Array(prefix.length + tail.length)
  out.set(prefix, 0)
  out.set(tail, prefix.length)
  return out
}

describe("Stage-1 inspectFileBytes (agregator)", () => {
  it("czysty PDF = niski poziom, brak sygnałów", () => {
    const v = inspectFileBytes("raport.pdf", bytesFrom([], "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>"))
    expect(v.level).toBe("low")
    expect(v.signals).toHaveLength(0)
    expect(v.detectedType).toBe("pdf")
    expect(v.summary).toContain("Brak niebezpiecznej struktury")
  })

  it("PDF z /Launch + /JavaScript = wysoki/krytyczny", () => {
    const v = inspectFileBytes(
      "faktura.pdf",
      bytesFrom([], "%PDF-1.5\n<< /OpenAction << /S /Launch /JavaScript (app.alert) >> >>\ntrailer")
    )
    expect(["high", "critical"]).toContain(v.level)
    expect(v.signals.some((s) => s.id === "pdf-launch")).toBe(true)
    expect(v.summary).toContain("niebezpieczny strukturalnie")
  })

  it("PE udający PDF = exe-masquerade w wynikach", () => {
    const v = inspectFileBytes("dokument.pdf", bytesFrom([0x4d, 0x5a, 0x90, 0x00], "rest"))
    expect(v.signals.some((s) => s.id === "magic-exe-masquerade")).toBe(true)
    expect(v.score).toBeGreaterThanOrEqual(55)
  })

  it("sizeBytes i sortowanie sygnałów malejąco", () => {
    const v = inspectFileBytes(
      "x.pdf",
      bytesFrom([], "%PDF-1.4 /Launch /JavaScript /AcroForm /URI")
    )
    expect(v.sizeBytes).toBeGreaterThan(0)
    const w = v.signals.map((s) => s.weight)
    expect(w).toEqual([...w].sort((a, b) => b - a))
  })

  it("nieznane bajty = low, typ null", () => {
    const v = inspectFileBytes("plik.bin", bytesFrom([0x01, 0x02, 0x03, 0x04], "abc"))
    expect(v.level).toBe("low")
    expect(v.detectedType).toBeNull()
  })
})
