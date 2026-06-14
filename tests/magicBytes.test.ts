// tests/magicBytes.test.ts — vitest GLOBALS (describe/it/expect są globalne).
import { inspectMagic } from "../src/shared/fileInspect/magicBytes"

const enc = new TextEncoder()

/** Łączy kilka Uint8Array w jeden. */
function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

describe("inspectMagic", () => {
  it("clean pdf named a.pdf → no signals, mismatch false", () => {
    const bytes = concat(
      Uint8Array.from([0x25, 0x50, 0x44, 0x46]), // %PDF
      enc.encode("-1.7\nrest of document")
    )
    const r = inspectMagic(bytes, "a.pdf")
    expect(r.detectedType).toBe("pdf")
    expect(r.declaredExtension).toBe("pdf")
    expect(r.mismatch).toBe(false)
    expect(r.polyglot).toBe(false)
    expect(r.signals).toEqual([])
  })

  it("PE bytes named invoice.pdf → exe-masquerade signal weight 75", () => {
    const bytes = concat(
      Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]), // MZ
      enc.encode("the rest of a windows executable")
    )
    const r = inspectMagic(bytes, "invoice.pdf")
    expect(r.detectedType).toBe("pe")
    expect(r.declaredExtension).toBe("pdf")
    expect(r.mismatch).toBe(true)
    expect(r.signals).toHaveLength(1)
    expect(r.signals[0].id).toBe("magic-exe-masquerade")
    expect(r.signals[0].weight).toBe(75)
    expect(r.signals[0].reason).toContain(".pdf")
  })

  it("png bytes named photo.jpg → generic mismatch weight 40", () => {
    const bytes = concat(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), // PNG
      enc.encode("rest of png")
    )
    const r = inspectMagic(bytes, "photo.jpg")
    expect(r.detectedType).toBe("png")
    expect(r.declaredExtension).toBe("jpg")
    expect(r.mismatch).toBe(true)
    expect(r.signals).toHaveLength(1)
    expect(r.signals[0].id).toBe("magic-type-mismatch")
    expect(r.signals[0].weight).toBe(40)
  })

  it("zip starting with PK but containing %PDF later named x.zip → polyglot", () => {
    const bytes = concat(
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]), // PK\x03\x04
      enc.encode("some zip directory bytes "),
      enc.encode("%PDF-1.4 embedded"), // second valid signature
      enc.encode(" more bytes")
    )
    const r = inspectMagic(bytes, "x.zip")
    expect(r.detectedType).toBe("zip")
    expect(r.declaredExtension).toBe("zip")
    expect(r.mismatch).toBe(false) // zip ext expects zip → no mismatch
    expect(r.polyglot).toBe(true)
    expect(r.signals).toHaveLength(1)
    expect(r.signals[0].id).toBe("magic-polyglot")
    expect(r.signals[0].weight).toBe(55)
  })

  it("unknown bytes → detectedType null, no signals", () => {
    const bytes = Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04])
    const r = inspectMagic(bytes, "mystery.bin")
    expect(r.detectedType).toBeNull()
    expect(r.declaredExtension).toBe("bin")
    expect(r.mismatch).toBe(false)
    expect(r.polyglot).toBe(false)
    expect(r.signals).toEqual([])
  })

  it("declaredExtension parsed from last dot for a.b.docx", () => {
    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]) // zip → matches docx family
    const r = inspectMagic(bytes, "a.b.docx")
    expect(r.declaredExtension).toBe("docx")
    expect(r.detectedType).toBe("zip")
    expect(r.mismatch).toBe(false)
    expect(r.signals).toEqual([])
  })

  it("empty declaredExtension when filename has no dot", () => {
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46])
    const r = inspectMagic(bytes, "noextension")
    expect(r.declaredExtension).toBe("")
  })

  it("signals sorted descending by weight (masquerade + polyglot)", () => {
    // MZ header (pe) + embedded %PDF, declared .pdf → masquerade(75) + polyglot(55)
    const bytes = concat(
      Uint8Array.from([0x4d, 0x5a]), // MZ
      enc.encode("stub region "),
      enc.encode("%PDF-1.5 appended"),
      enc.encode(" tail")
    )
    const r = inspectMagic(bytes, "report.pdf")
    expect(r.detectedType).toBe("pe")
    expect(r.mismatch).toBe(true)
    expect(r.polyglot).toBe(true)
    expect(r.signals).toHaveLength(2)
    expect(r.signals.map((s) => s.weight)).toEqual([75, 55])
    expect(r.signals[0].id).toBe("magic-exe-masquerade")
    expect(r.signals[1].id).toBe("magic-polyglot")
  })
})
