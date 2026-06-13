// src/components/ModuleToggles.tsx
// Przełączniki ON/OFF dla poszczególnych funkcji ochronnych.

import type { ModuleId, ModuleToggleState } from "./types"

interface ModuleTogglesProps {
  toggles: ModuleToggleState
  onToggle: (module: ModuleId, enabled: boolean) => void
}

interface ToggleMeta {
  id: ModuleId
  icon: string
  title: string
  description: string
  accent: string
}

const MODULES: ToggleMeta[] = [
  {
    id: "dataGhost",
    icon: "👻",
    title: "DataGhost",
    description: "Wstrzykuje fałszywy szum do profilu reklamowego",
    accent: "#a78bfa" // violet-400
  },
  {
    id: "mouseJitter",
    icon: "🌀",
    title: "Bionic Blur — Mysz",
    description: "Zaszumia trajektorię kursora (Perlin Noise)",
    accent: "#22d3ee" // cyan-400
  },
  {
    id: "keystroke",
    icon: "⌨️",
    title: "Bionic Blur — Klawiatura",
    description: "Fałszuje rytm pisania mikro-opóźnieniami",
    accent: "#34d399" // emerald-400
  }
]

export default function ModuleToggles({ toggles, onToggle }: ModuleTogglesProps) {
  return (
    <div className="flex flex-col gap-2">
      {MODULES.map((m) => {
        const enabled = toggles[m.id]
        return (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 transition-colors hover:bg-white/[0.06]">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
              style={{
                backgroundColor: enabled ? `${m.accent}1f` : "rgba(255,255,255,0.04)"
              }}>
              {m.icon}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-100">
                {m.title}
              </p>
              <p className="truncate text-[10px] leading-tight text-slate-400">
                {m.description}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`Przełącz ${m.title}`}
              onClick={() => onToggle(m.id, !enabled)}
              className="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: enabled ? m.accent : "rgba(255,255,255,0.15)"
              }}>
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                style={{ transform: enabled ? "translateX(18px)" : "translateX(2px)" }}
              />
            </button>
          </div>
        )
      })}
    </div>
  )
}
