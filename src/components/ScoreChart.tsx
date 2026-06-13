// src/components/ScoreChart.tsx
// THE hero moment — an animated radial Privacy Score gauge.
// Gradient teal stroke + breathing glow when armed, a rAF roll-up counter,
// a faint teal "jitter" particle field proving the defense is actively working,
// and a tier pill. Single rationed accent; numbers are tabular so they never twitch.

import type { ComponentType, SVGProps } from "react"
import { useEffect, useState } from "react"

import { ShieldAlert, ShieldCheck, ShieldOff } from "./icons"

export type ProtectionTier = "protected" | "guarded" | "exposed" | "standby"

interface ScoreChartProps {
  /** 0–100 protection score. */
  score: number
  tier: ProtectionTier
  /** True when at least one defense vector is active. */
  armed: boolean
  noiseCount: number
  trackerCount: number
}

type IconType = ComponentType<{ size?: number } & SVGProps<SVGSVGElement>>

const SIZE = 152
const STROKE = 9
const R = (SIZE - STROKE) / 2 - 6
const C = 2 * Math.PI * R
const CENTER = SIZE / 2

const TIER: Record<
  ProtectionTier,
  { label: string; text: string; chip: string; Icon: IconType }
> = {
  protected: { label: "PROTECTED", text: "text-accent", chip: "bg-accent-dim ring-accent/25", Icon: ShieldCheck },
  guarded: { label: "GUARDED", text: "text-warn", chip: "bg-warn/10 ring-warn/25", Icon: ShieldAlert },
  exposed: { label: "EXPOSED", text: "text-warn", chip: "bg-warn/10 ring-warn/25", Icon: ShieldAlert },
  standby: { label: "STANDBY", text: "text-fg-low", chip: "bg-white/[0.03] ring-line-strong", Icon: ShieldOff }
}

// Fixed scatter so the proof field never re-randomizes between renders.
const JITTER = [
  { x: 26, y: 34, d: "0s" },
  { x: 80, y: 16, d: "0.5s" },
  { x: 126, y: 36, d: "1s" },
  { x: 16, y: 80, d: "1.4s" },
  { x: 136, y: 84, d: "0.2s" },
  { x: 30, y: 122, d: "0.8s" },
  { x: 80, y: 136, d: "1.2s" },
  { x: 124, y: 122, d: "1.6s" },
  { x: 56, y: 24, d: "0.6s" },
  { x: 104, y: 132, d: "0.35s" }
]

export default function ScoreChart({
  score,
  tier,
  armed,
  noiseCount,
  trackerCount
}: ScoreChartProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))

  // Smooth roll-up of the centre value (respects reduced-motion).
  const [display, setDisplay] = useState(clamped)
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      setDisplay(clamped)
      return
    }
    const start = display
    const delta = clamped - start
    if (delta === 0) return
    const dur = 800
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(start + delta * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped])

  const offset = C * (1 - clamped / 100)
  const meta = TIER[tier]
  const TierIcon = meta.Icon

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {/* active-defense proof — faint drifting teal particles */}
        {armed && (
          <div className="jitter-field pointer-events-none absolute inset-0">
            {JITTER.map((p, i) => (
              <span
                key={i}
                className="jitter-dot"
                style={{ left: p.x, top: p.y, animationDelay: p.d }}
              />
            ))}
          </div>
        )}

        <svg
          className="-rotate-90"
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <defs>
            <linearGradient
              id="scoreGrad"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={SIZE}
              y2={SIZE}>
              <stop offset="0%" stopColor="#2BD4C4" />
              <stop offset="100%" stopColor="#1FB6A6" />
            </linearGradient>
          </defs>

          {/* track */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={STROKE}
          />
          {/* value */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={R}
            fill="none"
            stroke={armed ? "url(#scoreGrad)" : "#363B47"}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className={armed ? "anim-pulse" : ""}
            style={{
              transition:
                "stroke-dashoffset 800ms cubic-bezier(0.05,0.7,0.1,1), stroke 400ms ease"
            }}
          />
        </svg>

        {/* centre readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-display font-semibold tnum text-fg-hi">{display}</span>
          <span className="mt-0.5 text-micro uppercase text-fg-low">Privacy Score</span>
        </div>
      </div>

      {/* tier pill */}
      <div
        className={`-mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-inset ${meta.chip} ${meta.text}`}>
        <TierIcon size={13} />
        <span className="text-micro font-semibold">{meta.label}</span>
      </div>

      {/* forensic proof line */}
      <div className="mt-2 font-mono text-[11px] tnum text-fg-low">
        <span className="text-fg-mid">{noiseCount}</span> szum
        <span className="px-1.5 opacity-50">·</span>
        <span className="text-fg-mid">{trackerCount}</span> trackery
      </div>
    </div>
  )
}
