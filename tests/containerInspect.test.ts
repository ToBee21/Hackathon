// tests/containerInspect.test.ts
// Vitest GLOBALS (describe/it/expect) — bez importów testowych.
import { inspectContainer } from "../src/shared/fileInspect/containerInspect"

const PK_LOCAL = [0x50, 0x4b, 0x03, 0x04] // PK\x03\x04 (local file header)

/** Zapis uint16 little-endian. */
function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff]
}

/** Zapis uint32 little-endian. */
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

/**
 * Buduje minimalny, ale prawidłowy dla naszego parsera nagłówek centralnego
 * katalogu (PK\x01\x02) z podaną nazwą, flagą i rozmiarami. Brak extra/comment.
 */
function centralDirHeader(opts: {
  filename: string
  flag?: number
  compressedSize?: number
  uncompressedSize?: number
}): number[] {
  const { filename, flag = 0, compressedSize = 0, uncompressedSize = 0 } = opts
  const fnBytes: number[] = []
  for (let i = 0; i < filename.length; i++) {
    fnBytes.push(filename.charCodeAt(i) & 0xff)
  }
  const header: number[] = []
  header.push(0x50, 0x4b, 0x01, 0x02) // signature           (o+0)
  header.push(...u16(0x0014)) // version made by             (o+4)
  header.push(...u16(0x0014)) // version needed              (o+6)
  header.push(...u16(flag)) // general purpose bit flag      (o+8)
  header.push(...u16(0)) // compression method               (o+10)
  header.push(...u16(0)) // mod time                         (o+12)
  header.push(...u16(0)) // mod date                         (o+14)
  header.push(...u32(0)) // crc32                            (o+16)
  header.push(...u32(compressedSize)) // compressed size     (o+20)
  header.push(...u32(uncompressedSize)) // uncompressed size (o+24)
  header.push(...u16(fnBytes.length)) // filename length     (o+28)
  header.push(...u16(0)) // extra length                     (o+30)
  header.push(...u16(0)) // comment length                   (o+32)
  header.push(...u16(0)) // disk number start                (o+34)
  header.push(...u16(0)) // internal attrs                   (o+36)
  header.push(...u32(0)) // external attrs                   (o+38)
  header.push(...u32(0)) // local header offset              (o+42)
  header.push(...fnBytes) // filename                        (o+46)
  return header
}

/** Składa pełny bufor ZIP: local header + nagłówki centralnego katalogu. */
function buildZip(headers: number[][]): Uint8Array {
  const flat: number[] = [...PK_LOCAL]
  for (const h of headers) flat.push(...h)
  return Uint8Array.from(flat)
}

describe("inspectContainer", () => {
  it("zwraca kind 'none' i brak sygnałów dla nie-kontenera", () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])
    const r = inspectContainer(bytes)
    expect(r.kind).toBe("none")
    expect(r.signals).toEqual([])
    expect(r.hasMacros).toBe(false)
    expect(r.macroEvidence).toEqual([])
    expect(r.hasEncryptedEntries).toBe(false)
    expect(r.nestedExecutables).toEqual([])
    expect(r.zipBombSuspected).toBe(false)
  })

  it("wykrywa makra przy wpisie word/vbaProject.bin", () => {
    const bytes = buildZip([
      centralDirHeader({ filename: "word/vbaProject.bin" })
    ])
    const r = inspectContainer(bytes)
    expect(r.hasMacros).toBe(true)
    expect(r.macroEvidence).toContain("word/vbaProject.bin")
    expect(r.signals.some((s) => s.id === "container-macros")).toBe(true)
    expect(r.kind).toBe("zip")
  })

  it("rozpoznaje OOXML po wpisie [Content_Types].xml", () => {
    const bytes = buildZip([
      centralDirHeader({ filename: "[Content_Types].xml" }),
      centralDirHeader({ filename: "word/document.xml" })
    ])
    const r = inspectContainer(bytes)
    expect(r.kind).toBe("ooxml-zip")
  })

  it("wykrywa zaszyfrowane wpisy (general-purpose bit 0)", () => {
    const bytes = buildZip([
      centralDirHeader({ filename: "secret.txt", flag: 0x0001 })
    ])
    const r = inspectContainer(bytes)
    expect(r.hasEncryptedEntries).toBe(true)
    const sig = r.signals.find((s) => s.id === "container-encrypted")
    expect(sig).toBeDefined()
    expect(sig?.weight).toBe(35)
  })

  it("zbiera zagnieżdżone wykonywalne (payload.exe)", () => {
    const bytes = buildZip([centralDirHeader({ filename: "payload.exe" })])
    const r = inspectContainer(bytes)
    expect(r.nestedExecutables).toContain("payload.exe")
    const sig = r.signals.find((s) => s.id === "container-nested-exe")
    expect(sig).toBeDefined()
    expect(sig?.weight).toBe(70)
    expect(sig?.reason).toContain("payload.exe")
  })

  it("rozpoznaje OLE compound po magicznym prefiksie", () => {
    const bytes = Uint8Array.from([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00
    ])
    const r = inspectContainer(bytes)
    expect(r.kind).toBe("ole-compound")
  })

  it("wykrywa makra w OLE po markerze _VBA_PROJECT", () => {
    const prefix = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
    const marker = "_VBA_PROJECT"
    const markerBytes = [...marker].map((c) => c.charCodeAt(0))
    const bytes = Uint8Array.from([...prefix, ...markerBytes])
    const r = inspectContainer(bytes)
    expect(r.kind).toBe("ole-compound")
    expect(r.hasMacros).toBe(true)
    expect(r.macroEvidence).toContain("OLE VBA stream")
  })

  it("sortuje sygnały malejąco po wadze", () => {
    // exe (70) + macros (60) + encrypted (35) w jednym archiwum.
    const bytes = buildZip([
      centralDirHeader({ filename: "word/vbaProject.bin" }),
      centralDirHeader({ filename: "drop.exe" }),
      centralDirHeader({ filename: "locked.dat", flag: 0x0001 })
    ])
    const r = inspectContainer(bytes)
    const weights = r.signals.map((s) => s.weight)
    const sorted = [...weights].sort((a, b) => b - a)
    expect(weights).toEqual(sorted)
    expect(weights[0]).toBe(70)
  })
})
