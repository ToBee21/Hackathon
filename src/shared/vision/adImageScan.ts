// src/shared/vision/adImageScan.ts
//
// Page-side half of the AI vision ad-image blocker. UI-agnostic, dependency-free,
// privacy-safe: it enumerates ad-candidate <img> elements, rasterises each to a
// PNG dataURL via an offscreen <canvas>, hands that dataURL to an injected
// `classify` function, and (when flagged) applies a reversible blur + badge.
//
// Trust boundary: the ONLY thing that ever leaves this module is the PNG dataURL,
// and it goes solely to the caller-supplied `classify` fn (which the content
// script wires to a same-extension offscreen handler). Nothing touches the network
// here. The module never throws: any per-image failure (tainted canvas, draw
// error, unloaded image) is swallowed and counted as `skipped`.
//
// Idempotency: every processed <img> is stamped with a data attribute so repeated
// scans never double-render or double-blur the same element.

export interface AdVerdict {
  isAd: boolean
  description: string
}

export interface ScanResult {
  scanned: number
  blurred: number
  skipped: number
}

export interface ScanOptions {
  /** Minimum rendered width AND height (px) for an image to be a candidate. */
  minSize?: number
  /** Hard cap on classify() calls per scan (bounds latency; each call ~2.5s). */
  max?: number
  /** When true (default) only images intersecting the viewport are considered. */
  viewportOnly?: boolean
}

/** Marks an <img> the scanner has already inspected (any outcome). */
export const PROCESSED_ATTR = "data-cnd-vision"
/** Set to "ad" on images that received the blur treatment. */
export const PROCESSED_AD_VALUE = "ad"
/** Set to "clear" on images the classifier judged non-ad. */
export const PROCESSED_CLEAR_VALUE = "clear"
/** Set to "skip" on images that could not be rasterised/classified. */
export const PROCESSED_SKIP_VALUE = "skip"

/** Class applied to the blur wrapper so callers/CSS can find/clear treatments. */
export const BLUR_WRAPPER_CLASS = "cnd-vision-blur"
/** data attribute on the badge node, for querying/removal. */
export const BADGE_ATTR = "data-cnd-vision-badge"

const DEFAULT_MIN_SIZE = 64
const DEFAULT_MAX = 8
const DEFAULT_VIEWPORT_ONLY = true
const BLUR_PX = 14
const BADGE_TEXT = "AI · reklama"

interface Candidate {
  el: HTMLImageElement
  area: number
}

/**
 * Scan the document for ad-candidate images, classify each via `classify`, and
 * blur the ones flagged as ads. Returns counts. Never throws.
 */
export async function scanAndBlurAdImages(
  classify: (pngDataUrl: string) => Promise<AdVerdict>,
  opts: ScanOptions = {}
): Promise<ScanResult> {
  const result: ScanResult = { scanned: 0, blurred: 0, skipped: 0 }

  // No DOM (e.g. SW / offscreen-less context) → nothing to do, but don't throw.
  if (typeof document === "undefined" || !document) return result

  const minSize = clampPositive(opts.minSize, DEFAULT_MIN_SIZE)
  const max = clampPositive(opts.max, DEFAULT_MAX)
  const viewportOnly =
    opts.viewportOnly === undefined ? DEFAULT_VIEWPORT_ONLY : !!opts.viewportOnly

  const candidates = collectCandidates(minSize, viewportOnly).slice(0, max)

  for (const { el } of candidates) {
    // Re-check the stamp inside the loop: an earlier iteration / concurrent scan
    // may have processed this node, and classify() is async (yields the loop).
    if (isProcessed(el)) continue

    let dataUrl: string | null = null
    try {
      dataUrl = renderToPngDataUrl(el)
    } catch {
      dataUrl = null
    }

    if (!dataUrl) {
      stamp(el, PROCESSED_SKIP_VALUE)
      result.skipped++
      continue
    }

    let verdict: AdVerdict
    try {
      verdict = await classify(dataUrl)
    } catch {
      // Classifier blew up for this image → skip gracefully, keep scanning.
      stamp(el, PROCESSED_SKIP_VALUE)
      result.skipped++
      continue
    }

    // Guard against a stamp landing during the await above.
    if (isProcessed(el)) continue

    result.scanned++

    if (verdict && verdict.isAd) {
      try {
        applyBlurTreatment(el, verdict.description)
        stamp(el, PROCESSED_AD_VALUE)
        result.blurred++
      } catch {
        // Treatment failed (detached node, exotic layout) → don't lie, count skip.
        stamp(el, PROCESSED_SKIP_VALUE)
        result.skipped++
      }
    } else {
      stamp(el, PROCESSED_CLEAR_VALUE)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

function collectCandidates(minSize: number, viewportOnly: boolean): Candidate[] {
  let imgs: HTMLImageElement[]
  try {
    imgs = Array.prototype.slice.call(
      document.querySelectorAll("img")
    ) as HTMLImageElement[]
  } catch {
    return []
  }

  const out: Candidate[] = []
  for (const el of imgs) {
    if (!el || isProcessed(el)) continue
    if (!isVisible(el)) continue

    const { width, height } = measure(el)
    if (width < minSize || height < minSize) continue
    if (viewportOnly && !intersectsViewport(el)) continue

    out.push({ el, area: width * height })
  }

  // Biggest / most prominent first.
  out.sort((a, b) => b.area - a.area)
  return out
}

function isProcessed(el: Element): boolean {
  try {
    return el.getAttribute(PROCESSED_ATTR) != null
  } catch {
    return false
  }
}

function stamp(el: Element, value: string): void {
  try {
    el.setAttribute(PROCESSED_ATTR, value)
  } catch {
    /* read-only / detached node — nothing we can do, ignore */
  }
}

/** Visible == rendered box, not display:none / visibility:hidden / opacity:0. */
function isVisible(el: HTMLImageElement): boolean {
  try {
    // getComputedStyle is the authority when available (jsdom-free node lacks it).
    const win =
      (el.ownerDocument && el.ownerDocument.defaultView) ||
      (typeof window !== "undefined" ? window : null)
    if (win && typeof win.getComputedStyle === "function") {
      const cs = win.getComputedStyle(el)
      if (cs) {
        if (cs.display === "none") return false
        if (cs.visibility === "hidden" || cs.visibility === "collapse") return false
        if (cs.opacity !== "" && Number(cs.opacity) === 0) return false
      }
    }
  } catch {
    /* fall through to geometry check */
  }

  const { width, height } = measure(el)
  return width > 0 && height > 0
}

/**
 * Rendered size. Prefer the layout box (getBoundingClientRect) and fall back to
 * client/natural dimensions so the module still works against lightweight DOM
 * doubles in tests.
 */
function measure(el: HTMLImageElement): { width: number; height: number } {
  let width = 0
  let height = 0
  try {
    if (typeof el.getBoundingClientRect === "function") {
      const r = el.getBoundingClientRect()
      if (r) {
        width = r.width
        height = r.height
      }
    }
  } catch {
    /* ignore */
  }
  if (!width) width = numberOr(el.clientWidth, numberOr(el.naturalWidth, 0))
  if (!height) height = numberOr(el.clientHeight, numberOr(el.naturalHeight, 0))
  return { width, height }
}

function intersectsViewport(el: HTMLImageElement): boolean {
  let rect: { top: number; left: number; bottom: number; right: number } | null =
    null
  try {
    if (typeof el.getBoundingClientRect === "function") {
      const r = el.getBoundingClientRect()
      if (r) rect = { top: r.top, left: r.left, bottom: r.bottom, right: r.right }
    }
  } catch {
    rect = null
  }
  // No geometry available (test double) → treat as in-viewport so size/visibility
  // remain the meaningful filters.
  if (!rect) return true

  const vw =
    (typeof window !== "undefined" &&
      (window.innerWidth || (document.documentElement && document.documentElement.clientWidth))) ||
    0
  const vh =
    (typeof window !== "undefined" &&
      (window.innerHeight || (document.documentElement && document.documentElement.clientHeight))) ||
    0
  if (!vw || !vh) return true

  return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw
}

// ---------------------------------------------------------------------------
// Rasterisation
// ---------------------------------------------------------------------------

/**
 * Draw the image onto an offscreen canvas and return a PNG dataURL. Returns null
 * (caller counts as skip) when the image is not loaded, the canvas is tainted,
 * or any drawing/encoding step throws. Never throws.
 */
function renderToPngDataUrl(el: HTMLImageElement): string | null {
  // Only rasterise fully-decoded images. `complete` plus a non-zero natural size
  // is the reliable "this image actually has pixels" signal.
  if (!el.complete) return null
  const nW = numberOr(el.naturalWidth, 0)
  const nH = numberOr(el.naturalHeight, 0)
  if (nW <= 0 || nH <= 0) return null

  // Do NOT toggle el.crossOrigin here. The image is already `complete` (checked
  // above); setting crossOrigin on a loaded <img> forces the browser to
  // invalidate + re-fetch it, and the synchronous drawImage below then captures a
  // blank/partial frame — this silently blanked data:-URL images (the offscreen
  // saw an empty image -> "not an ad"). If a cross-origin image was loaded without
  // CORS, drawImage taints the canvas and toDataURL throws below; we skip it
  // gracefully, which is the correct outcome.
  let canvas: HTMLCanvasElement
  try {
    canvas = document.createElement("canvas")
  } catch {
    return null
  }
  canvas.width = nW
  canvas.height = nH

  let ctx: CanvasRenderingContext2D | null
  try {
    ctx = canvas.getContext("2d")
  } catch {
    ctx = null
  }
  if (!ctx) return null

  try {
    ctx.drawImage(el, 0, 0, nW, nH)
  } catch {
    // Cross-origin without CORS, decode race, etc.
    return null
  }

  try {
    // Throws SecurityError on a tainted canvas → we skip gracefully.
    return canvas.toDataURL("image/png")
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Reversible blur treatment
// ---------------------------------------------------------------------------

/**
 * Blur the image (CSS filter) and overlay a small click-to-reveal badge. The
 * treatment is reversible: clicking the image or the badge restores the original
 * filter and removes the badge.
 */
function applyBlurTreatment(el: HTMLImageElement, description: string): void {
  const doc = el.ownerDocument || document
  if (!el.style) return

  // Preserve whatever filter the page had so reveal is a true restore.
  const priorFilter = el.style.filter || ""
  el.setAttribute("data-cnd-prior-filter", priorFilter)
  el.style.filter = composeFilter(priorFilter, `blur(${BLUR_PX}px)`)
  el.style.cursor = "pointer"
  if (description) el.setAttribute("data-cnd-vision-desc", clip(description, 200))

  const badge = buildBadge(doc)

  const reveal = (ev?: Event) => {
    if (ev) {
      try {
        ev.preventDefault()
        ev.stopPropagation()
      } catch {
        /* ignore */
      }
    }
    try {
      el.style.filter = el.getAttribute("data-cnd-prior-filter") || ""
      el.style.cursor = ""
    } catch {
      /* ignore */
    }
    try {
      if (badge && badge.parentNode) badge.parentNode.removeChild(badge)
    } catch {
      /* ignore */
    }
    el.setAttribute(PROCESSED_ATTR, "revealed")
  }

  safeAddListener(badge, "click", reveal)
  safeAddListener(el, "click", reveal)

  positionBadgeOver(el, badge)
}

function buildBadge(doc: Document): HTMLElement {
  const badge = doc.createElement("div")
  badge.setAttribute(BADGE_ATTR, "1")
  badge.textContent = BADGE_TEXT
  // Inline styles only — no stylesheet dependency, survives hostile CSS resets.
  const s = badge.style
  s.position = "absolute"
  s.zIndex = "2147483646"
  s.padding = "2px 8px"
  s.font =
    "600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  s.letterSpacing = "0.04em"
  s.color = "#04211c"
  s.background = "rgba(64, 224, 200, 0.92)" // ration teal
  s.borderRadius = "4px"
  s.boxShadow = "0 1px 4px rgba(0,0,0,0.35)"
  s.cursor = "pointer"
  s.userSelect = "none"
  s.pointerEvents = "auto"
  s.whiteSpace = "nowrap"
  return badge
}

/**
 * Wrap the image in a positioned container (when possible) and pin the badge to
 * the top-left corner. Falls back to inserting the badge as a sibling if wrapping
 * is not possible, so we never lose the badge entirely.
 */
function positionBadgeOver(el: HTMLImageElement, badge: HTMLElement): void {
  const parent = el.parentNode as (Node & ParentNode) | null
  const doc = el.ownerDocument || document

  // Preferred path: wrap the <img> in a relatively-positioned span so the badge
  // tracks the image regardless of page layout.
  if (parent && typeof doc.createElement === "function") {
    try {
      const wrapper = doc.createElement("span")
      wrapper.className = BLUR_WRAPPER_CLASS
      const ws = wrapper.style
      ws.position = "relative"
      ws.display = "inline-block"
      ws.lineHeight = "0"
      ws.maxWidth = "100%"
      parent.insertBefore(wrapper, el)
      wrapper.appendChild(el)
      wrapper.appendChild(badge)
      const bs = badge.style
      bs.top = "6px"
      bs.left = "6px"
      return
    } catch {
      /* fall through to sibling insertion */
    }
  }

  // Fallback: drop the badge right after the image. Position can't track scroll
  // here, but the treatment + reveal still work, which is what matters.
  try {
    if (parent) parent.insertBefore(badge, el.nextSibling)
  } catch {
    /* truly nowhere to put it — the blur alone still applied */
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function composeFilter(prior: string, add: string): string {
  const p = (prior || "").trim()
  if (!p || p === "none") return add
  if (p.indexOf(add) !== -1) return p
  return `${p} ${add}`
}

function safeAddListener(
  target: EventTarget | null,
  type: string,
  handler: (ev: Event) => void
): void {
  try {
    if (target && typeof target.addEventListener === "function") {
      target.addEventListener(type, handler)
    }
  } catch {
    /* ignore */
  }
}

function clampPositive(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.floor(value)
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text
}
