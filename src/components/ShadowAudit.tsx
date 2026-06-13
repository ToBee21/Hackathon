// src/components/ShadowAudit.tsx
// Digital Shadow Audit — the judge-safe, non-counterproductive Category-3 view.
// Passively measures the user's REAL browser fingerprint (the popup is not
// patched by Bionic Blur) and shows an honest, estimated identifiability gauge
// plus the per-attribute breakdown. Mono is used for the data layer only.

import { useCallback, useEffect, useState } from "react"

import { Fingerprint } from "./icons"
import {
  collectShadowProfile,
  type ShadowProfile,
  type ShadowRarity
} from "../shared/shadowAudit"

const RARITY: Record<ShadowRarity, { label: string; color: string }> = {
  low: { label: "Niska", color: "#2BD4C4" },
  moderate: { label: "Umiarkowana", color: "#46E6A8" },
  high: { label: "Wysoka", color: "#F5A623" },
  "very-high": { label: "Bardzo wysoka", color: "#E5484D" }
}

// Scale the entropy bar against ~30 bits (≈ effectively unique on the web).
const SCALE_BITS = 30

function formatOneInN(n: number): string {
  if (!Number.isFinite(n)) return "—"
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

export default function ShadowAudit() {
  const [profile, setProfile] = useState<ShadowProfile | null>(null)

  const scan = useCallback(() => {
    try {
      setProfile(collectShadowProfile())
    } catch {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    scan()
  }, [scan])

  const rarity = profile ? RARITY[profile.rarity] : null

  return (
    <div className="overflow-hidden rounded-xl bg-surface-1 shadow-card">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Fingerprint size={13} className="text-accent" />
          <span className="text-micro uppercase text-fg-mid">Cień cyfrowy · audyt</span>
        </div>
        <button
          type="button"
          onClick={scan}
          className="font-mono text-[10px] uppercase tracking-wide text-fg-low transition-colors hover:text-fg-mid">
          skanuj
        </button>
      </div>

      {profile && rarity ? (
        <div className="p-3">
          <div className="mb-2.5 flex items-end justify-between">
            <div className="leading-tight">
              <p className="text-micro uppercase text-fg-low">Rozpoznawalność</p>
              <p
                className="text-[15px] font-semibold"
                style={{ color: rarity.color }}>
                {rarity.label}
              </p>
            </div>
            <div className="text-right leading-tight">
              <p className="font-mono text-[15px] tnum text-fg-hi">
                ~{profile.totalBits}{" "}
                <span className="text-[10px] text-fg-low">bit</span>
              </p>
              <p className="font-mono text-[10px] tnum text-fg-low">
                ≈ 1 / {formatOneInN(profile.oneInN)}
              </p>
            </div>
          </div>

          {/* estimated-entropy bar */}
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-[width] duration-base ease-standard"
              style={{
                width: `${Math.min(100, (profile.totalBits / SCALE_BITS) * 100)}%`,
                backgroundColor: rarity.color
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            {profile.attributes.map((a) => (
              <div
                key={a.key}
                className="grid grid-cols-[84px_1fr_auto] items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-fg-low">
                  {a.label}
                </span>
                <span
                  className="truncate font-mono text-[10.5px] text-fg-mid"
                  title={a.value}>
                  {a.value}
                </span>
                <span className="font-mono text-[9px] tnum text-fg-low">
                  {a.bits ? `${a.bits}b` : "—"}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-2.5 text-[9px] leading-snug text-fg-low/70">
            Szacunek poglądowy (typowe wartości entropii — Panopticlick/AmIUnique),
            nie pomiar względem realnej populacji. Popup pokazuje Twój prawdziwy
            fingerprint; maskowanie Bionic Blur działa na stronach WWW.
          </p>
        </div>
      ) : (
        <div className="flex h-24 flex-col items-center justify-center gap-2 text-center">
          <Fingerprint size={22} className="text-fg-low opacity-40" />
          <p className="text-[11px] text-fg-low">Audyt niedostępny w tym kontekście</p>
        </div>
      )}
    </div>
  )
}
