// tests/visionAdImageScan.test.ts
//
// Unit tests for the page-side ad-image scanner. The repo's vitest environment is
// "node" (see vitest.config.ts) with no jsdom, and existing tests fake the DOM by
// hand (see tests/floatingLayer.test.ts). We do the same here: a tiny, purpose-
// built DOM double is installed on globalThis for each test, exercising candidate
// filtering, idempotency, blur-only-on-ad, and graceful skip on a tainted canvas.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  scanAndBlurAdImages,
  PROCESSED_ATTR,
  BADGE_ATTR,
  type AdVerdict
} from "../src/shared/vision/adImageScan"

// ---------------------------------------------------------------------------
// Minimal DOM doubles
// ---------------------------------------------------------------------------

interface FakeNodeOpts {
  width?: number
  height?: number
  display?: string
  visibility?: string
  opacity?: string
  complete?: boolean
  naturalWidth?: number
  naturalHeight?: number
  /** When true, toDataURL throws SecurityError (tainted canvas). */
  taint?: boolean
}

// A permissive style bag: real CSSStyleDeclaration accepts arbitrary property
// writes, so we model it as a string-keyed record (created via Object.create so
// reads of unset props yield undefined, like the DOM does not — but the scanner
// only ever reads .filter/.cursor which we seed).
type FakeStyle = Record<string, string>
function makeStyle(): FakeStyle {
  return { filter: "", cursor: "" }
}

let nodeId = 0

class FakeElement {
  tagName: string
  attrs: Record<string, string> = {}
  style: FakeStyle = makeStyle()
  children: FakeElement[] = []
  parentNode: FakeElement | null = null
  nextSibling: FakeElement | null = null
  listeners: Record<string, Array<(ev: unknown) => void>> = {}
  ownerDocument: FakeDocument
  textContent = ""
  className = ""
  readonly __id = ++nodeId

  // image-ish props
  width: number
  height: number
  complete: boolean
  naturalWidth: number
  naturalHeight: number
  crossOrigin: string | null = null

  // computed-style backing
  _display: string
  _visibility: string
  _opacity: string
  _taint: boolean

  constructor(tagName: string, doc: FakeDocument, opts: FakeNodeOpts = {}) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = doc
    this.width = opts.width ?? 0
    this.height = opts.height ?? 0
    this.complete = opts.complete ?? true
    this.naturalWidth = opts.naturalWidth ?? opts.width ?? 0
    this.naturalHeight = opts.naturalHeight ?? opts.height ?? 0
    this._display = opts.display ?? "inline"
    this._visibility = opts.visibility ?? "visible"
    this._opacity = opts.opacity ?? "1"
    this._taint = !!opts.taint
  }

  getAttribute(name: string): string | null {
    return name in this.attrs ? this.attrs[name] : null
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = value
  }

  getBoundingClientRect() {
    return {
      width: this.width,
      height: this.height,
      top: 0,
      left: 0,
      bottom: this.height,
      right: this.width
    }
  }

  get clientWidth() {
    return this.width
  }
  get clientHeight() {
    return this.height
  }

  addEventListener(type: string, handler: (ev: unknown) => void): void {
    ;(this.listeners[type] ||= []).push(handler)
  }

  dispatch(type: string, ev: unknown = {}): void {
    for (const h of this.listeners[type] || []) h(ev)
  }

  insertBefore(node: FakeElement, ref: FakeElement | null): FakeElement {
    node.parentNode = this
    const idx = ref ? this.children.indexOf(ref) : -1
    if (idx >= 0) this.children.splice(idx, 0, node)
    else this.children.push(node)
    return node
  }
  appendChild(node: FakeElement): FakeElement {
    node.parentNode = this
    this.children.push(node)
    return node
  }
  removeChild(node: FakeElement): FakeElement {
    const idx = this.children.indexOf(node)
    if (idx >= 0) this.children.splice(idx, 1)
    node.parentNode = null
    return node
  }

  // canvas-ish. Drawing a tainted image onto the canvas taints the canvas,
  // mirroring the browser's cross-origin security model.
  getContext(kind: string) {
    if (kind !== "2d") return null
    const canvas = this
    return {
      drawImage: (src: FakeElement) => {
        if (src && src._taint) canvas._taint = true
      }
    }
  }
  toDataURL(_type?: string): string {
    if (this._taint) {
      const err = new Error("Tainted canvas") as Error & { name: string }
      err.name = "SecurityError"
      throw err
    }
    return "data:image/png;base64,STUBPNGDATA"
  }
}

class FakeDocument {
  documentElement = { clientWidth: 1024, clientHeight: 768 }
  imgs: FakeElement[] = []
  defaultView: FakeWindow | null = null

  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this)
  }
  querySelectorAll(sel: string): FakeElement[] {
    if (sel === "img") return this.imgs.slice()
    return []
  }
  addImg(opts: FakeNodeOpts): FakeElement {
    const el = new FakeElement("img", this, opts)
    // Real images live in the DOM with a parent; give each one a container so
    // the badge has somewhere to be wrapped/placed (matches a real page).
    const container = new FakeElement("div", this)
    container.appendChild(el)
    this.imgs.push(el)
    return el
  }
}

class FakeWindow {
  innerWidth = 1024
  innerHeight = 768
  doc: FakeDocument
  constructor(doc: FakeDocument) {
    this.doc = doc
  }
  getComputedStyle(el: FakeElement) {
    return {
      display: el._display,
      visibility: el._visibility,
      opacity: el._opacity
    }
  }
}

// ---------------------------------------------------------------------------
// Harness wiring
// ---------------------------------------------------------------------------

let doc: FakeDocument
let win: FakeWindow

beforeEach(() => {
  nodeId = 0
  doc = new FakeDocument()
  win = new FakeWindow(doc)
  doc.defaultView = win
  ;(globalThis as Record<string, unknown>).document = doc
  ;(globalThis as Record<string, unknown>).window = win
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).document
  delete (globalThis as Record<string, unknown>).window
  vi.restoreAllMocks()
})

const adAll = async (): Promise<AdVerdict> => ({ isAd: true, description: "ad" })
const adNone = async (): Promise<AdVerdict> => ({ isAd: false, description: "" })

function badgeOf(img: FakeElement): FakeElement | undefined {
  const wrapper = img.parentNode
  return wrapper?.children.find((c) => c.getAttribute(BADGE_ATTR) != null)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("scanAndBlurAdImages — candidate filtering", () => {
  it("skips images smaller than minSize on either side", async () => {
    doc.addImg({ width: 40, height: 40 }) // too small (both)
    doc.addImg({ width: 300, height: 40 }) // too short
    const big = doc.addImg({ width: 300, height: 250 }) // candidate
    const classify = vi.fn(adAll)

    const res = await scanAndBlurAdImages(classify, { viewportOnly: false })

    expect(classify).toHaveBeenCalledTimes(1)
    expect(res.scanned).toBe(1)
    expect(res.blurred).toBe(1)
    expect(big.getAttribute(PROCESSED_ATTR)).toBe("ad")
  })

  it("respects a custom minSize", async () => {
    doc.addImg({ width: 120, height: 120 })
    const classify = vi.fn(adNone)
    await scanAndBlurAdImages(classify, { viewportOnly: false, minSize: 200 })
    expect(classify).not.toHaveBeenCalled()
  })

  it("ignores invisible images (display:none / visibility:hidden / opacity:0)", async () => {
    doc.addImg({ width: 300, height: 250, display: "none" })
    doc.addImg({ width: 300, height: 250, visibility: "hidden" })
    doc.addImg({ width: 300, height: 250, opacity: "0" })
    const visible = doc.addImg({ width: 300, height: 250 })
    const classify = vi.fn(adAll)

    const res = await scanAndBlurAdImages(classify, { viewportOnly: false })

    expect(classify).toHaveBeenCalledTimes(1)
    expect(res.blurred).toBe(1)
    expect(visible.getAttribute(PROCESSED_ATTR)).toBe("ad")
  })

  it("caps the number of classify calls at `max`, biggest-first", async () => {
    doc.addImg({ width: 300, height: 100 }) // area 30k
    doc.addImg({ width: 400, height: 400 }) // area 160k  (biggest)
    doc.addImg({ width: 300, height: 250 }) // area 75k
    const seen: number[] = []
    const classify = vi.fn(async () => {
      seen.push(1)
      return { isAd: false, description: "" }
    })

    const res = await scanAndBlurAdImages(classify, { viewportOnly: false, max: 2 })

    expect(classify).toHaveBeenCalledTimes(2)
    expect(res.scanned).toBe(2)
    // The single un-scanned image is the smallest (area 30k); the two largest ran.
    const unscanned = doc.imgs.filter((i) => i.getAttribute(PROCESSED_ATTR) == null)
    expect(unscanned).toHaveLength(1)
    expect(unscanned[0].width * unscanned[0].height).toBe(30000)
  })

  it("filters by viewport when viewportOnly is true (default)", async () => {
    const offscreen = doc.addImg({ width: 300, height: 250 })
    // Push it fully below the viewport.
    offscreen.getBoundingClientRect = () => ({
      width: 300,
      height: 250,
      top: 2000,
      left: 0,
      bottom: 2250,
      right: 300
    })
    doc.addImg({ width: 300, height: 250 }) // in viewport
    const classify = vi.fn(adNone)

    await scanAndBlurAdImages(classify) // default viewportOnly true

    expect(classify).toHaveBeenCalledTimes(1)
    expect(offscreen.getAttribute(PROCESSED_ATTR)).toBeNull()
  })
})

describe("scanAndBlurAdImages — blur treatment", () => {
  it("applies blur + badge ONLY when verdict.isAd", async () => {
    const banner = doc.addImg({ width: 728, height: 250 }) // area 182k (biggest)
    const square = doc.addImg({ width: 300, height: 300 }) // area 90k
    // Flag the first-classified candidate (biggest = banner) as ad, the rest not.
    let call = 0
    const classify = vi.fn(async (): Promise<AdVerdict> => {
      call++
      return call === 1
        ? { isAd: true, description: "banner ad" }
        : { isAd: false, description: "" }
    })

    const res = await scanAndBlurAdImages(classify, { viewportOnly: false })

    expect(res.scanned).toBe(2)
    expect(res.blurred).toBe(1)
    // Banner (ad) blurred + badged.
    expect(banner.style.filter).toContain("blur(14px)")
    expect(banner.getAttribute(PROCESSED_ATTR)).toBe("ad")
    expect(badgeOf(banner)?.textContent).toBe("AI · reklama")
    // Square (not ad) untouched, marked clear, no badge.
    expect(square.style.filter).toBe("")
    expect(square.getAttribute(PROCESSED_ATTR)).toBe("clear")
    expect(badgeOf(square)).toBeUndefined()
  })

  it("blur treatment is reversible via click-to-reveal", async () => {
    const img = doc.addImg({ width: 300, height: 250 })
    await scanAndBlurAdImages(adAll, { viewportOnly: false })

    expect(img.style.filter).toContain("blur(14px)")
    const badge = badgeOf(img)
    expect(badge).toBeDefined()

    // Click the image → blur cleared, badge removed.
    img.dispatch("click", { preventDefault() {}, stopPropagation() {} })
    expect(img.style.filter).toBe("")
    expect(badgeOf(img)).toBeUndefined()
    expect(img.getAttribute(PROCESSED_ATTR)).toBe("revealed")
  })

  it("badge uses no emoji and the exact required label", async () => {
    const img = doc.addImg({ width: 300, height: 250 })
    await scanAndBlurAdImages(adAll, { viewportOnly: false })
    const label = badgeOf(img)?.textContent || ""
    expect(label).toBe("AI · reklama")
    // No emoji / pictographs.
    expect(/\p{Extended_Pictographic}/u.test(label)).toBe(false)
  })
})

describe("scanAndBlurAdImages — idempotency", () => {
  it("does not re-process an already-stamped image across scans", async () => {
    doc.addImg({ width: 300, height: 250 })
    const classify = vi.fn(adAll)

    const first = await scanAndBlurAdImages(classify, { viewportOnly: false })
    expect(first.blurred).toBe(1)
    expect(classify).toHaveBeenCalledTimes(1)

    const second = await scanAndBlurAdImages(classify, { viewportOnly: false })
    expect(classify).toHaveBeenCalledTimes(1) // unchanged
    expect(second.scanned).toBe(0)
    expect(second.blurred).toBe(0)
    expect(second.skipped).toBe(0)
  })

  it("does not double-blur within a single scan if a node is pre-stamped", async () => {
    const img = doc.addImg({ width: 300, height: 250 })
    img.setAttribute(PROCESSED_ATTR, "ad") // pretend already handled
    const classify = vi.fn(adAll)
    const res = await scanAndBlurAdImages(classify, { viewportOnly: false })
    expect(classify).not.toHaveBeenCalled()
    expect(res.scanned).toBe(0)
  })
})

describe("scanAndBlurAdImages — graceful skip", () => {
  it("skips (does not throw / blur) on a tainted canvas", async () => {
    const tainted = doc.addImg({ width: 300, height: 250, taint: true })
    const classify = vi.fn(adAll)

    const res = await scanAndBlurAdImages(classify, { viewportOnly: false })

    expect(classify).not.toHaveBeenCalled() // never reached the classifier
    expect(res.skipped).toBe(1)
    expect(res.blurred).toBe(0)
    expect(tainted.style.filter).toBe("")
    expect(tainted.getAttribute(PROCESSED_ATTR)).toBe("skip")
  })

  it("skips images that are not fully loaded", async () => {
    doc.addImg({ width: 300, height: 250, complete: false })
    doc.addImg({ width: 300, height: 250, naturalWidth: 0, naturalHeight: 0 })
    const classify = vi.fn(adAll)

    const res = await scanAndBlurAdImages(classify, { viewportOnly: false })

    expect(classify).not.toHaveBeenCalled()
    expect(res.skipped).toBe(2)
  })

  it("skips (counts) when the classifier itself throws, without aborting the scan", async () => {
    doc.addImg({ width: 400, height: 400 }) // biggest, classifier throws
    const ok = doc.addImg({ width: 300, height: 250 }) // smaller, classifier ok
    let call = 0
    const classify = vi.fn(async (): Promise<AdVerdict> => {
      call++
      if (call === 1) throw new Error("infer boom")
      return { isAd: true, description: "ad" }
    })

    const res = await scanAndBlurAdImages(classify, { viewportOnly: false })

    expect(classify).toHaveBeenCalledTimes(2)
    expect(res.skipped).toBe(1)
    expect(res.blurred).toBe(1)
    expect(ok.style.filter).toContain("blur(14px)")
  })

  it("never throws and returns zero counts when there is no DOM", async () => {
    delete (globalThis as Record<string, unknown>).document
    const res = await scanAndBlurAdImages(adAll)
    expect(res).toEqual({ scanned: 0, blurred: 0, skipped: 0 })
  })
})
