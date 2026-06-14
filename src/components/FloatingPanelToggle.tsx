// src/components/FloatingPanelToggle.tsx
// Advanced setting: globally enable/disable the on-page floating panel. Self
// contained — reads/writes cnd:floating:enabled directly, so it needs no wiring
// into the dashboard's state. The content script (floatingWindow.ts) honors the
// flag at init and reacts to changes live.

import { useEffect, useState } from "react"

import { STORAGE_KEYS } from "../shared/storageKeys"

const ext = globalThis.chrome

export function FloatingPanelToggle(): JSX.Element {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (!ext?.storage?.local) return
    ext.storage.local.get({ [STORAGE_KEYS.floatingEnabled]: true }, (res) => {
      setEnabled(Boolean(res?.[STORAGE_KEYS.floatingEnabled]))
    })
  }, [])

  const toggle = (next: boolean) => {
    setEnabled(next)
    ext?.storage?.local?.set({ [STORAGE_KEYS.floatingEnabled]: next })
  }

  return (
    <div
      className="flex items-center justify-between rounded-xl border px-3 py-2.5"
      style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
    >
      <div className="leading-tight">
        <p className="text-[11px] font-semibold text-fg-hi">Panel na stronie</p>
        <p className="text-[9px] uppercase tracking-[0.12em] text-fg-low">
          Pływające okno Deep-Dive
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Przełącz pływający panel na stronie"
        onClick={() => toggle(!enabled)}
        className="relative h-[22px] w-[40px] rounded-full transition-colors"
        style={{ backgroundColor: enabled ? "#2BD4C4" : "#2C2F39" }}
      >
        <span
          className="absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-white transition-transform"
          style={{ transform: enabled ? "translateX(18px)" : "translateX(0)" }}
        />
      </button>
    </div>
  )
}
