// src/components/ModuleToggles.tsx
// Defense-vector switches. Each active toggle lights to its own signal colour
// (a deliberate legend, matched to the logger), with an overshoot knob and a
// soft outer glow. Optical alignment across rows; full-bleed hairline dividers.

import { SIGNAL } from "./signals"
import type { ModuleId, ModuleToggleState } from "./types"

interface ModuleTogglesProps {
  toggles: ModuleToggleState
  onToggle: (module: ModuleId, enabled: boolean) => void
}

const MODULES: { id: ModuleId; title: string; desc: string }[] = [
  {
    id: "dataGhost",
    title: "DataGhost",
    desc: "Generuje anonimowy ruch-wabik utrudniający profilowanie"
  },
  {
    id: "mouseJitter",
    title: "Bionic Blur · Mysz",
    desc: "Zaszumia trajektorię kursora szumem Perlina"
  },
  {
    id: "keystroke",
    title: "Bionic Blur · Klawiatura",
    desc: "Maskuje rytm pisania mikro-opóźnieniami"
  },
  {
    id: "honeypot",
    title: "Honeypot Trap",
    desc: "Zatruwa żądania trackerów sprzecznym profilem w locie"
  },
  {
    id: "cookieShredder",
    title: "Cookie Shredder",
    desc: "Rotuje ID ciasteczek trackerów — co cykl wyglądasz jak nowy użytkownik"
  }
]

function Switch({
  enabled,
  color,
  label,
  onClick
}: {
  enabled: boolean
  color: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`Przełącz ${label}`}
      onClick={onClick}
      className="relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-base ease-standard"
      style={{
        backgroundColor: enabled ? color : "#2C2F39",
        boxShadow: enabled
          ? `inset 0 0 0 1px ${color}, 0 0 0 3px ${color}1f`
          : "inset 0 0 0 1px rgba(255,255,255,0.10)"
      }}>
      <span
        className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-fg-hi shadow"
        style={{
          transform: enabled ? "translateX(18px)" : "translateX(0)",
          transition: "transform 220ms cubic-bezier(0.34,1.56,0.64,1)"
        }}
      />
    </button>
  )
}

export default function ModuleToggles({ toggles, onToggle }: ModuleTogglesProps) {
  const activeCount = MODULES.filter((m) => toggles[m.id]).length

  return (
    <div className="overflow-hidden rounded-xl bg-surface-1 shadow-card">
      <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
        <span className="text-micro uppercase text-fg-low">Wektory ochrony</span>
        <span className="font-mono text-[10px] tnum text-fg-low">
          {activeCount}/{MODULES.length}
        </span>
      </div>

      <div className="divide-y divide-line">
        {MODULES.map((m) => {
          const enabled = toggles[m.id]
          const { color, Icon } = SIGNAL[m.id]
          return (
            <div
              key={m.id}
              className="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-3 py-2.5">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-base"
                style={{
                  backgroundColor: enabled ? `${color}22` : "rgba(255,255,255,0.04)",
                  color: enabled ? color : "#6E7480"
                }}>
                <Icon size={16} />
              </span>

              <div className="min-w-0">
                <p className="truncate text-ui font-medium text-fg-hi">{m.title}</p>
                <p className="truncate text-[11px] leading-tight text-fg-low">{m.desc}</p>
              </div>

              <Switch
                enabled={enabled}
                color={color}
                label={m.title}
                onClick={() => onToggle(m.id, !enabled)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
