// src/components/ScoreChart.tsx
// Animowany wykres Privacy Score (pierścień postępu SVG).

import { useEffect, useState } from "react"

interface ScoreChartProps {
  /** Wynik 0–100 obliczony dynamicznie na podstawie aktywności modułów. */
  score: number
}

const RADIUS = 54
const STROKE = 10
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Dobiera kolor pierścienia w zależności od poziomu ochrony. */
function scoreColor(score: number): string {
  if (score >= 70) return "#34d399" // emerald-400
  if (score >= 40) return "#fbbf24" // amber-400
  return "#f87171" // red-400
}

/** Krótka etykieta opisująca poziom ochrony. */
function scoreLabel(score: number): string {
  if (score >= 70) return "OCHRONA WYSOKA"
  if (score >= 40) return "OCHRONA CZĘŚCIOWA"
  if (score > 0) return "OCHRONA NISKA"
  return "BRAK OCHRONY"
}

export default function ScoreChart({ score }: ScoreChartProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))

  // Płynne "doliczanie" wartości w środku pierścienia.
  const [display, setDisplay] = useState(clamped)
  useEffect(() => {
    const start = display
    const delta = clamped - start
    if (delta === 0) return
    const duration = 600
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      // ease-out
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(start + delta * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped])

  const color = scoreColor(clamped)
  const offset = CIRCUMFERENCE * (1 - clamped / 100)

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="relative h-36 w-36">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128">
          {/* Ścieżka tła */}
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={STROKE}
          />
          {/* Pierścień postępu */}
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 0.6s ease-out, stroke 0.4s ease",
              filter: `drop-shadow(0 0 6px ${color})`
            }}
          />
        </svg>

        {/* Wartość liczbowa w centrum */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-4xl font-bold tabular-nums"
            style={{ color }}>
            {display}
          </span>
          <span className="text-[10px] font-medium tracking-widest text-slate-400">
            PRIVACY SCORE
          </span>
        </div>
      </div>

      <span
        className="rounded-full px-3 py-1 text-[10px] font-semibold tracking-wider"
        style={{ color, backgroundColor: `${color}1a` }}>
        {scoreLabel(clamped)}
      </span>
    </div>
  )
}
