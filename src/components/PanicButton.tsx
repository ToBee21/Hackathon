// src/components/PanicButton.tsx
// Friction proportional to consequence: a hold-to-wipe kill switch in its own
// "danger zone". Press-and-hold fills the bar; release early aborts; completion
// fires the deep-clean and flashes a confirmation. Danger red exists ONLY here.

import { useCallback, useEffect, useRef, useState } from "react"

import { Power, ShieldCheck } from "./icons"

const HOLD_MS = 850

export default function PanicButton({ onPanic }: { onPanic: () => void }) {
  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState(false)
  const [fired, setFired] = useState(false)
  const raf = useRef(0)
  const startT = useRef(0)

  const stop = useCallback(() => cancelAnimationFrame(raf.current), [])

  const fire = useCallback(() => {
    stop()
    setActive(false)
    setProgress(1)
    setFired(true)
    onPanic()
    window.setTimeout(() => {
      setFired(false)
      setProgress(0)
    }, 1500)
  }, [onPanic, stop])

  const tick = useCallback(
    (now: number) => {
      const p = Math.min(1, (now - startT.current) / HOLD_MS)
      setProgress(p)
      if (p >= 1) {
        fire()
        return
      }
      raf.current = requestAnimationFrame(tick)
    },
    [fire]
  )

  const begin = useCallback(() => {
    if (fired) return
    setActive(true)
    startT.current = performance.now()
    stop()
    raf.current = requestAnimationFrame(tick)
  }, [fired, stop, tick])

  const end = useCallback(() => {
    if (fired) return
    setActive(false)
    stop()
    setProgress(0)
  }, [fired, stop])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const label = fired
    ? "Sesje śledzące wyczyszczone"
    : active
      ? "Trzymaj, aby zerwać sesje…"
      : "Przytrzymaj, aby wyczyścić"

  return (
    <div className="rounded-xl bg-surface-2 p-3 shadow-card ring-1 ring-inset ring-danger/25">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-danger/15 text-danger">
          <Power size={14} />
        </span>
        <div className="leading-tight">
          <p className="text-micro uppercase text-danger">Strefa awaryjna</p>
          <p className="text-[10px] text-fg-low">Czyści ciasteczka, storage i cache</p>
        </div>
      </div>

      <button
        type="button"
        onPointerDown={begin}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
            e.preventDefault()
            begin()
          }
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") end()
        }}
        aria-label="Przytrzymaj, aby wyczyścić dane sesji"
        className="relative w-full touch-none select-none overflow-hidden rounded-lg py-2.5 ring-1 ring-inset ring-danger/40 transition-shadow duration-base focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
        style={{ backgroundColor: fired ? "#D03439" : "rgba(229,72,77,0.12)" }}>
        {/* hold-progress fill */}
        <span
          aria-hidden="true"
          className="absolute inset-0 origin-left bg-danger"
          style={{
            transform: `scaleX(${progress})`,
            transition: active ? "none" : "transform 260ms cubic-bezier(0.3,0,0.8,0.15)",
            opacity: fired ? 1 : 0.55
          }}
        />
        <span
          className="relative flex items-center justify-center gap-2 text-ui font-semibold tracking-wide"
          style={{ color: fired ? "#fff" : progress > 0.5 ? "#fff" : "#E5484D" }}>
          {fired ? <ShieldCheck size={15} /> : <Power size={15} />}
          {label}
        </span>
      </button>
    </div>
  )
}
