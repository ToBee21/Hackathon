// src/components/LoggerView.tsx
// Real-time Logger — strumień zdarzeń maskowanych przez system.

import { useEffect, useRef } from "react"

import type { LogEntry, LogSource } from "./types"

interface LoggerViewProps {
  entries: LogEntry[]
}

const SOURCE_META: Record<LogSource, { icon: string; color: string; label: string }> = {
  dataGhost: { icon: "👻", color: "#a78bfa", label: "DataGhost" },
  mouseJitter: { icon: "🌀", color: "#22d3ee", label: "Mysz" },
  keystroke: { icon: "⌨️", color: "#34d399", label: "Klawiatura" },
  system: { icon: "🛡️", color: "#fbbf24", label: "System" }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })
}

export default function LoggerView({ entries }: LoggerViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll do najnowszego wpisu (lista rośnie od góry → trzymamy górę).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }, [entries.length])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-widest text-slate-400">
          REAL-TIME LOGGER
        </h2>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          live
        </span>
      </div>

      <div
        ref={scrollRef}
        className="logger-scroll flex h-40 flex-col gap-1.5 overflow-y-auto rounded-xl border border-white/5 bg-black/30 p-2">
        {entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
            <span className="text-2xl opacity-40">🕵️</span>
            <p className="text-[11px] text-slate-500">
              Brak zdarzeń. System nasłuchuje…
            </p>
          </div>
        ) : (
          entries.map((entry) => {
            const meta = SOURCE_META[entry.source]
            return (
              <div
                key={entry.id}
                className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5 text-xs animate-[fadeIn_0.25s_ease-out]">
                <span className="text-sm leading-none">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-200">{entry.message}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className="text-[9px] font-semibold tracking-wide"
                      style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="text-[9px] text-slate-600">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
