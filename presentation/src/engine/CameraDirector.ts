// ============================================================
// CameraDirector — pixel-targeted camera over a virtual stage.
//
// Model: a `content` element (transform-origin: 0 0, position: absolute,
// inset: 0) is transformed by translate3d(tx,ty,0) scale(z). The viewport
// is the clipping frame. Every camera move is reproducible from data:
// either a named element id (fit-to-bounding-box) or an explicit shot.
//
// A child at content-local (lx,ly) paints at screen:
//   sx = viewportLeft + tx + lx*z
//   sy = viewportTop  + ty + ly*z
// We invert that (using the stored transform) to recover (lx,ly), so shots
// are independent of the current transform and can be precomputed once.
// ============================================================

export interface Shot {
  tx: number
  ty: number
  z: number
}

export type TargetResolver = (id: string) => Element | null

export interface CameraOptions {
  minZoom?: number
  maxZoom?: number
  /** fraction of the viewport a focused element should fill */
  focusFill?: number
  /** fraction the "wide" shot should fill */
  wideFill?: number
  reducedMotion?: boolean
}

const IDENTITY: Shot = { tx: 0, ty: 0, z: 1 }

export class CameraDirector {
  private viewport: HTMLElement
  private content: HTMLElement
  private resolver: TargetResolver
  private opts: Required<CameraOptions>
  private current: Shot = { ...IDENTITY }
  private raf = 0
  private ro?: ResizeObserver

  // debug snapshot
  public debug = {
    z: 1,
    tx: 0,
    ty: 0,
    targetId: "—",
    keyframe: "—",
    vw: 0,
    vh: 0,
  }

  constructor(
    viewport: HTMLElement,
    content: HTMLElement,
    resolver: TargetResolver,
    options: CameraOptions = {},
  ) {
    this.viewport = viewport
    this.content = content
    this.resolver = resolver
    this.opts = {
      minZoom: options.minZoom ?? 0.4,
      maxZoom: options.maxZoom ?? 3.2,
      focusFill: options.focusFill ?? 0.5,
      wideFill: options.wideFill ?? 0.9,
      reducedMotion: options.reducedMotion ?? false,
    }
    this.content.style.transformOrigin = "0 0"
    this.content.style.willChange = "transform"
  }

  observeResize(onResize: () => void) {
    this.ro = new ResizeObserver(() => onResize())
    this.ro.observe(this.viewport)
    this.ro.observe(this.content)
  }

  dispose() {
    this.ro?.disconnect()
    if (this.raf) cancelAnimationFrame(this.raf)
  }

  private vpRect() {
    return this.viewport.getBoundingClientRect()
  }

  /** content-local geometry of an element, inverting the current transform */
  private localBox(el: Element) {
    const vp = this.vpRect()
    const r = el.getBoundingClientRect()
    const { tx, ty, z } = this.current
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    return {
      lx: (cx - vp.left - tx) / z,
      ly: (cy - vp.top - ty) / z,
      lw: r.width / z,
      lh: r.height / z,
    }
  }

  /** Compute the shot that centers + fits an element to a fill fraction. */
  shotForElement(el: Element, fill: number): Shot {
    const vp = this.vpRect()
    const { lx, ly, lw, lh } = this.localBox(el)
    const zx = (vp.width * fill) / Math.max(lw, 1)
    const zy = (vp.height * fill) / Math.max(lh, 1)
    let z = Math.min(zx, zy)
    z = Math.max(this.opts.minZoom, Math.min(this.opts.maxZoom, z))
    return {
      z,
      tx: vp.width / 2 - lx * z,
      ty: vp.height / 2 - ly * z,
    }
  }

  /** Resolve a keyframe (targetId + zoom hint) to an absolute shot. */
  shotForTarget(targetId: string | undefined, zoomHint: number, fill?: number): Shot {
    const el = targetId ? this.resolver(targetId) : this.resolver("__root__")
    if (!el) return { ...IDENTITY }
    const baseFill = fill ?? (targetId ? this.opts.focusFill : this.opts.wideFill)
    const shot = this.shotForElement(el, baseFill)
    // honor an explicit zoom hint as a soft multiplier when fitting close-ups
    if (targetId && zoomHint && zoomHint !== 1) {
      const vp = this.vpRect()
      const { lx, ly } = this.localBox(el)
      const z = Math.max(this.opts.minZoom, Math.min(this.opts.maxZoom, shot.z * (zoomHint / 1.9)))
      return { z, tx: vp.width / 2 - lx * z, ty: vp.height / 2 - ly * z }
    }
    return shot
  }

  private commit(shot: Shot) {
    this.current = shot
    this.content.style.transform = `translate3d(${shot.tx.toFixed(2)}px, ${shot.ty.toFixed(
      2,
    )}px, 0) scale(${shot.z.toFixed(4)})`
    const vp = this.vpRect()
    this.debug.z = shot.z
    this.debug.tx = shot.tx
    this.debug.ty = shot.ty
    this.debug.vw = Math.round(vp.width)
    this.debug.vh = Math.round(vp.height)
  }

  /** Imperative instant set. */
  jumpTo(shot: Shot, targetId = "—", keyframe = "—") {
    this.content.classList.remove("is-animating")
    this.debug.targetId = targetId
    this.debug.keyframe = keyframe
    this.commit(shot)
  }

  /** Animated move (CSS-transition based; instant under reduced motion). */
  flyTo(shot: Shot, durationMs = 900, targetId = "—", keyframe = "—") {
    this.debug.targetId = targetId
    this.debug.keyframe = keyframe
    if (this.opts.reducedMotion) {
      this.jumpTo(shot, targetId, keyframe)
      return
    }
    this.content.style.setProperty("--cam-dur", `${durationMs}ms`)
    this.content.classList.add("is-animating")
    // next frame so the transition picks up
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(() => this.commit(shot))
  }

  focusElement(id: string, opts: { animate?: boolean; fill?: number; keyframe?: string } = {}) {
    const el = this.resolver(id)
    if (!el) return
    const shot = this.shotForElement(el, opts.fill ?? this.opts.focusFill)
    if (opts.animate === false) this.jumpTo(shot, id, opts.keyframe)
    else this.flyTo(shot, 900, id, opts.keyframe)
  }

  reset(animate = true) {
    const el = this.resolver("__root__")
    const shot = el ? this.shotForElement(el, this.opts.wideFill) : { ...IDENTITY }
    if (animate) this.flyTo(shot, 900, "—", "wide")
    else this.jumpTo(shot, "—", "wide")
  }

  /**
   * Scroll-scrub playback across an ordered list of precomputed keyframe shots.
   * progress ∈ [0,1]. Sets the transform directly (no CSS transition) so the
   * camera tracks the scrollbar 1:1 without layout thrash.
   */
  scrubTo(progress: number, keyframes: { at: number; shot: Shot; targetId?: string; label?: string }[]) {
    if (keyframes.length === 0) return
    this.content.classList.remove("is-animating")
    const p = Math.max(0, Math.min(1, progress))

    let a = keyframes[0]
    let b = keyframes[keyframes.length - 1]
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (p >= keyframes[i].at && p <= keyframes[i + 1].at) {
        a = keyframes[i]
        b = keyframes[i + 1]
        break
      }
    }
    const span = Math.max(1e-4, b.at - a.at)
    const tRaw = (p - a.at) / span
    const t = this.opts.reducedMotion ? (tRaw < 0.5 ? 0 : 1) : easeInOut(Math.max(0, Math.min(1, tRaw)))
    const shot: Shot = {
      tx: lerp(a.shot.tx, b.shot.tx, t),
      ty: lerp(a.shot.ty, b.shot.ty, t),
      z: lerp(a.shot.z, b.shot.z, t),
    }
    const active = t < 0.5 ? a : b
    this.debug.targetId = active.targetId ?? "—"
    this.debug.keyframe = active.label ?? "—"
    this.commit(shot)
  }

  get currentShot(): Shot {
    return { ...this.current }
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}
