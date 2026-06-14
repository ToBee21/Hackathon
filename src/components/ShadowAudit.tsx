// src/components/ShadowAudit.tsx
// Digital Shadow Audit — the judge-safe, non-counterproductive Category-3 view.
// Passively measures the user's REAL browser fingerprint (the popup is not
// patched by Bionic Blur) and now shows an "Entropy Drop": the real, identifiable
// trace (red) versus the estimated masked trace for the selected Virtual Identity
// (green). Mono is used for the data layer only. Numbers stay illustrative.

import { useCallback, useEffect, useMemo, useState } from "react"

import { ChevronDown, Fingerprint } from "./icons"
import { getProfilePreset } from "../shared/bionicBlurCore"
import {
  collectShadowProfile,
  estimateMaskedShadow,
  type ShadowProfile,
  type ShadowRarity
} from "../shared/shadowAudit"
import {
  collectInferredProfile,
  type InferredProfile
} from "../shared/inferredProfile"
import type { ProfileBucket, ProfileId } from "../types"

const RARITY: Record<ShadowRarity, { label: string; color: string }> = {
  low: { label: "Niska", color: "#2BD4C4" },
  moderate: { label: "Umiarkowana", color: "#46E6A8" },
  high: { label: "Wysoka", color: "#F5A623" },
  "very-high": { label: "Bardzo wysoka", color: "#E5484D" }
}

const REAL_COLOR = "#E5484D"
const MASK_COLOR = "#46E6A8"

// Scale the entropy bar against ~30 bits (≈ effectively unique on the web).
const SCALE_BITS = 30

function formatOneInN(n: number): string {
  if (!Number.isFinite(n)) return "—"
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

interface ShadowAuditProps {
  /** Wybrana wirtualna tożsamość (steruje paskiem „po"). */
  profileId?: ProfileId
  /** Bucket profilu Custom (gdy profileId === "custom"). */
  customBucket?: ProfileBucket | null
}

function EntropyRow({
  caption,
  bits,
  oneIn,
  color,
  widthPct
}: {
  caption: string
  bits: string
  oneIn: string
  color: string
  widthPct: number
}) {
  return (
    <div>
      <div className="mb-1 flex items-end justify-between">
        <span className="text-[10px] uppercase tracking-wide text-fg-low">
          {caption}
        </span>
        <span className="font-mono text-[11px] tnum" style={{ color }}>
          {bits} <span className="text-[9px] text-fg-low">bit · {oneIn}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-[width] duration-base ease-standard"
          style={{ width: `${widthPct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

const INTEREST_COLOR = "#9A8CFF"

function InferredSection({ data }: { data: InferredProfile | null }) {
  if (!data) {
    return (
      <p className="mt-3 border-t border-line pt-2.5 text-[10px] text-fg-low">
        Analizuję historię…
      </p>
    )
  }

  if (!data.available || data.interests.length === 0) {
    return (
      <div className="mt-3 border-t border-line pt-2.5">
        <p className="text-micro uppercase text-fg-low">Profil z historii</p>
        <p className="mt-1 text-[10px] leading-snug text-fg-mid">
          {data.reason ?? "Brak danych."}
          {data.available === false &&
            " Włącz uprawnienie „history” i przeładuj wtyczkę, by zobaczyć realny profil."}
        </p>
      </div>
    )
  }

  const pct = (v: number) => Math.round(v * 100)

  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-micro uppercase text-fg-low">
          Zainteresowania (z Twojej historii)
        </p>
        <span className="font-mono text-[9px] tnum text-fg-low">
          {data.domainsMatched} dopasowań
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {data.interests.map((it) => (
          <div key={it.id}>
            <div className="mb-0.5 flex items-end justify-between">
              <span className="text-[10.5px] text-fg-mid">{it.label}</span>
              <span className="font-mono text-[9px] tnum text-fg-low">{pct(it.share)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(4, pct(it.share))}%`,
                  backgroundColor: INTEREST_COLOR
                }}
              />
            </div>
            {it.evidence.length > 0 && (
              <p className="mt-0.5 truncate font-mono text-[9px] text-fg-low/70">
                {it.evidence.join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>

      {(data.gender || data.age) && (
        <div className="mt-3 rounded-lg border border-dashed border-line p-2.5">
          <p className="text-micro uppercase text-fg-low">
            Jak zgaduje Cię branża reklamowa
          </p>
          <div className="mt-1.5 flex gap-4">
            {data.gender && (
              <div className="leading-tight">
                <p className="text-[11px] text-fg-hi">{data.gender.label}</p>
                <p className="font-mono text-[9px] tnum text-fg-low">
                  pewność ~{pct(data.gender.confidence)}%
                </p>
              </div>
            )}
            {data.age && (
              <div className="leading-tight">
                <p className="text-[11px] text-fg-hi">{data.age.label} lat</p>
                <p className="font-mono text-[9px] tnum text-fg-low">
                  pewność ~{pct(data.age.confidence)}%
                </p>
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[9px] leading-snug text-fg-low/70">
            To stereotypowa zgadywanka profilerów na podstawie kategorii stron —
            często BŁĘDNA. Pokazujemy ją, byś zobaczył skalę profilowania. Liczone
            lokalnie, nic nie wychodzi z przeglądarki.
          </p>
        </div>
      )}
    </div>
  )
}

export default function ShadowAudit({
  profileId = "auto",
  customBucket = null
}: ShadowAuditProps) {
  const [profile, setProfile] = useState<ShadowProfile | null>(null)
  const [inferred, setInferred] = useState<InferredProfile | null>(null)
  const [open, setOpen] = useState(false)

  const scan = useCallback(() => {
    try {
      setProfile(collectShadowProfile())
    } catch {
      setProfile(null)
    }
    collectInferredProfile()
      .then(setInferred)
      .catch(() => setInferred(null))
  }, [])

  useEffect(() => {
    scan()
  }, [scan])

  const masked = useMemo(
    () => estimateMaskedShadow(profileId, customBucket),
    [profileId, customBucket]
  )

  const rarity = profile ? RARITY[profile.rarity] : null
  const presetLabel = getProfilePreset(profileId)?.label
  const maskedCaption =
    masked.mode === "custom"
      ? "Maska · Custom"
      : presetLabel
        ? `Maska · ${presetLabel}`
        : masked.label

  const drop =
    profile && masked.totalBits != null
      ? Math.round((profile.totalBits - masked.totalBits) * 10) / 10
      : null

  return (
    <div className="overflow-hidden rounded-xl bg-surface-1 shadow-card">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-fg-mid transition-colors hover:text-fg-hi">
          <ChevronDown
            size={13}
            className="text-fg-low transition-transform duration-base"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
          <Fingerprint size={13} className="text-accent" />
          <span className="text-micro uppercase">Cień cyfrowy · audyt</span>
        </button>
        {open && (
          <button
            type="button"
            onClick={scan}
            className="font-mono text-[10px] uppercase tracking-wide text-fg-low transition-colors hover:text-fg-mid">
            skanuj
          </button>
        )}
      </div>

      {open && (profile && rarity ? (
        <div className="p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-micro uppercase text-fg-low">Rozpoznawalność</p>
            {drop != null && drop > 0 && (
              <span
                className="font-mono text-[10px] tnum"
                style={{ color: MASK_COLOR }}>
                −{drop} bit
              </span>
            )}
          </div>

          {/* Entropy Drop: przed (realny ślad) → po (maska) */}
          <div className="mb-3 flex flex-col gap-2.5">
            <EntropyRow
              caption="Twój ślad (realny)"
              bits={`~${profile.totalBits}`}
              oneIn={`1 / ${formatOneInN(profile.oneInN)}`}
              color={REAL_COLOR}
              widthPct={Math.min(100, (profile.totalBits / SCALE_BITS) * 100)}
            />

            {masked.totalBits != null ? (
              <EntropyRow
                caption={maskedCaption}
                bits={`~${masked.totalBits}`}
                oneIn={`1 / ${formatOneInN(masked.oneInN ?? 0)}`}
                color={MASK_COLOR}
                widthPct={Math.min(100, (masked.totalBits / SCALE_BITS) * 100)}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-line px-2.5 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-fg-low">
                  Maska · Auto
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-fg-mid">
                  Rotacja per-site — inny profil na każdej stronie, brak stałego
                  śladu do połączenia.
                </p>
              </div>
            )}
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
            fingerprint; maskowanie działa na stronach WWW.
          </p>

          <InferredSection data={inferred} />
        </div>
      ) : (
        <div className="flex h-24 flex-col items-center justify-center gap-2 text-center">
          <Fingerprint size={22} className="text-fg-low opacity-40" />
          <p className="text-[11px] text-fg-low">Audyt niedostępny w tym kontekście</p>
        </div>
      ))}
    </div>
  )
}
