import { useEffect, useState } from "react"
import { debugState } from "../engine/debugStore"

/** Debug HUD: camera transform, active target/keyframe, section, scroll, fps. */
export function DebugOverlay() {
  const [, force] = useState(0)
  const [fps, setFps] = useState(0)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let frames = 0
    let acc = 0
    const loop = (now: number) => {
      const dt = now - last
      last = now
      frames++
      acc += dt
      if (acc >= 500) {
        setFps(Math.round((frames * 1000) / acc))
        frames = 0
        acc = 0
      }
      force((n) => (n + 1) % 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const d = debugState
  return (
    <div className="debug" role="status" aria-hidden>
      <h4>camera director · debug</h4>
      <div className="row"><span>section</span><span>{d.section}</span></div>
      <div className="row"><span>keyframe</span><span>{d.keyframe}</span></div>
      <div className="row"><span>target id</span><span>{d.targetId}</span></div>
      <div className="row"><span>zoom</span><span>{d.z.toFixed(3)}×</span></div>
      <div className="row"><span>translate</span><span>{Math.round(d.tx)},{Math.round(d.ty)}</span></div>
      <div className="row"><span>scroll</span><span>{Math.round(d.progress * 100)}%</span></div>
      <div className="row"><span>reduced</span><span>{d.reduced ? "on" : "off"}</span></div>
      <div className="row"><span>deck issues</span><span>{d.issues}</span></div>
      <div className="row"><span>fps</span><span style={{ color: fps >= 50 ? "var(--ink-0)" : "var(--red-bright)" }}>{fps}</span></div>
    </div>
  )
}
