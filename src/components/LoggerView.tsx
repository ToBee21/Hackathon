// src/components/LoggerView.tsx
// Live telemetry feed — the one place monospace is allowed (the data layer).
// Precise HH:mm:ss.SSS timestamps + colour-coded source tags read as real
// telemetry, not a screensaver. New rows slide in and flash once, then settle.
// Repeated events collapse into a single row with a ×N multiplier.

import { useEffect, useRef } from "react"

import { Activity, Aperture } from "./icons"
import { SIGNAL } from "./signals"
import type { LogEntry } from "./types"

interface LoggerViewProps {
  entries: LogEntry[]
}

function fmt(ts: number): string {
  const d = new Date(ts)
  const p = (n: number, len = 2) => String(n).padStart(len, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(
    d.getMilliseconds(),
    3
  )}`
}

export default function LoggerView({ entries }: LoggerViewProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Newest entries are prepended → keep the viewport pinned to the top.
  useEffect(() => {
    ref.current?.scrollTo({ top: 0, behavior: "smooth" })
  }, [entries.length])

  return (
    <div className="overflow-hidden rounded-xl bg-surface-1 shadow-card">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Activity size={13} className="text-accent" />
          <span className="text-micro uppercase text-fg-mid">Telemetria na żywo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="anim-ping absolute inline-flex h-full w-full rounded-full bg-accent" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          <span className="font-mono text-[10px] tnum text-fg-low">{entries.length}</span>
        </div>
      </div>

      <div
        ref={ref}
        className="scroll-thin flex h-44 flex-col gap-0.5 overflow-y-auto p-1.5">
        {entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <Aperture size={22} className="text-fg-low opacity-40" />
            <p className="text-[11px] text-fg-low">Brak zdarzeń · system nasłuchuje</p>
          </div>
        ) : (
          entries.map((e) => {
            const s = SIGNAL[e.source]
            const repeated = (e.count ?? 1) > 1
            return (
              <div
                key={e.id}
                className="anim-logrow grid grid-cols-[74px_1fr] items-center gap-2 rounded-md px-1.5 py-1">
                <span className="font-mono text-[10px] tnum text-fg-low">
                  {fmt(e.timestamp)}
                </span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}66` }}
                  />
                  <span
                    className="shrink-0 font-mono text-[10px] font-medium tracking-wide"
                    style={{ color: s.color }}>
                    {s.short}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-mid">
                    {e.message}
                  </span>
                  {repeated && (
                    <span className="shrink-0 rounded bg-white/10 px-1 font-mono text-[9px] tnum text-fg-mid">
                      ×{e.count}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
