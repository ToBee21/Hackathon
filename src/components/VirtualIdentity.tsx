// src/components/VirtualIdentity.tsx
// Selektor wirtualnej tożsamości. Pozwala wybrać tryb maski fingerprintu:
// Auto (rotacja per-site, domyślne), jedną z nazwanych person, albo profil Custom
// budowany z rodziny OS (ze spójnym GPU/UA). Suwak „Intensywność maski" steruje
// siłą zniekształceń dynamicznych (mysz/timing) przez istniejący BionicBlurConfig.
// Komponent jest kontrolowany — stan i zapis do storage trzyma popup.

import { Aperture } from "./icons"
import {
  buildCustomBucket,
  DEFAULT_CUSTOM_OS,
  extremityToConfig,
  getProfilePreset,
  PROFILE_PRESETS
} from "../shared/bionicBlurCore"
import type { OsFamily, ProfileBucket, ProfileId } from "../types"

interface VirtualIdentityProps {
  profileId: ProfileId
  customBucket: ProfileBucket | null
  /** Suwak 0–100. */
  extremity: number
  onSelectProfile: (id: ProfileId) => void
  onChangeExtremity: (value: number) => void
  onChangeCustom: (bucket: ProfileBucket) => void
}

const ACCENT = "#2BD4C4"

const MODES: { id: ProfileId; label: string; sub: string }[] = [
  { id: "auto", label: "Auto", sub: "rotacja per-site" },
  ...PROFILE_PRESETS.map((p) => ({ id: p.id, label: p.label, sub: p.persona })),
  { id: "custom", label: "Custom", sub: "własny profil" }
]

const OS_OPTIONS: { os: OsFamily; label: string }[] = [
  { os: "windows", label: "Windows" },
  { os: "macos", label: "macOS" },
  { os: "linux", label: "Linux" }
]

function osFamilyFromPlatform(platform: string): OsFamily {
  if (platform.includes("Mac")) return "macos"
  if (platform.includes("Linux")) return "linux"
  return "windows"
}

function extremityLevel(value: number): string {
  if (value <= 15) return "Subtelna"
  if (value <= 45) return "Zbalansowana"
  if (value <= 75) return "Agresywna"
  return "Maksymalna"
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[68px_1fr] items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-fg-low">
        {label}
      </span>
      <span className="truncate font-mono text-[10.5px] text-fg-mid" title={value}>
        {value}
      </span>
    </div>
  )
}

export default function VirtualIdentity({
  profileId,
  customBucket,
  extremity,
  onSelectProfile,
  onChangeExtremity,
  onChangeCustom
}: VirtualIdentityProps) {
  const previewBucket: ProfileBucket | null =
    profileId === "auto"
      ? null
      : profileId === "custom"
        ? customBucket ?? buildCustomBucket(DEFAULT_CUSTOM_OS)
        : getProfilePreset(profileId)?.bucket ?? null

  const selectedOs = previewBucket
    ? osFamilyFromPlatform(previewBucket.platform)
    : DEFAULT_CUSTOM_OS

  const derived = extremityToConfig(extremity)
  const isFixed = profileId !== "auto"

  return (
    <div className="overflow-hidden rounded-xl bg-surface-1 shadow-card">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Aperture size={13} className="text-accent" />
          <span className="text-micro uppercase text-fg-mid">
            Wirtualna tożsamość
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wide text-fg-low">
          {profileId === "auto" ? "auto" : profileId === "custom" ? "custom" : "persona"}
        </span>
      </div>

      <div className="p-3">
        {/* Selektor person */}
        <div className="grid grid-cols-2 gap-1.5">
          {MODES.map((m) => {
            const active = m.id === profileId
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectProfile(m.id)}
                className="rounded-lg px-2.5 py-1.5 text-left transition-colors duration-base"
                style={{
                  backgroundColor: active ? `${ACCENT}1a` : "rgba(255,255,255,0.04)",
                  boxShadow: active
                    ? `inset 0 0 0 1px ${ACCENT}`
                    : "inset 0 0 0 1px rgba(255,255,255,0.06)"
                }}>
                <p
                  className="truncate text-[11px] font-medium"
                  style={{ color: active ? ACCENT : "#C9CDD6" }}>
                  {m.label}
                </p>
                <p className="truncate text-[9px] leading-tight text-fg-low">
                  {m.sub}
                </p>
              </button>
            )
          })}
        </div>

        {/* Mini-form Custom: rodzina OS (spójny GPU/UA) */}
        {profileId === "custom" && (
          <div className="mt-2.5">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-fg-low">
              System Custom
            </p>
            <div className="flex gap-1.5">
              {OS_OPTIONS.map((o) => {
                const active = o.os === selectedOs
                return (
                  <button
                    key={o.os}
                    type="button"
                    onClick={() => onChangeCustom(buildCustomBucket(o.os))}
                    className="flex-1 rounded-md py-1 text-[10px] font-medium transition-colors duration-base"
                    style={{
                      backgroundColor: active ? `${ACCENT}1a` : "rgba(255,255,255,0.04)",
                      color: active ? ACCENT : "#9AA0AB",
                      boxShadow: active
                        ? `inset 0 0 0 1px ${ACCENT}`
                        : "inset 0 0 0 1px rgba(255,255,255,0.06)"
                    }}>
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Podgląd wybranej maski */}
        <div className="mt-2.5 rounded-lg bg-white/[0.03] px-2.5 py-2">
          {previewBucket ? (
            <div className="flex flex-col gap-1">
              <PreviewRow label="Platforma" value={previewBucket.platform} />
              <PreviewRow label="GPU" value={previewBucket.webglRenderer} />
              <PreviewRow
                label="Ekran"
                value={`${previewBucket.screen.width}×${previewBucket.screen.height}`}
              />
              <PreviewRow label="Strefa" value={previewBucket.timezone} />
              <PreviewRow label="Język" value={previewBucket.locale} />
            </div>
          ) : (
            <p className="text-[10px] leading-snug text-fg-mid">
              Każda strona widzi inny spójny profil — maksymalna nielinkowalność
              między witrynami.
            </p>
          )}
        </div>

        {/* Suwak intensywności maski */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-fg-low">
              Intensywność maski
            </span>
            <span className="font-mono text-[10px] tnum" style={{ color: ACCENT }}>
              {extremityLevel(extremity)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={extremity}
            onChange={(e) => onChangeExtremity(Number(e.target.value))}
            aria-label="Intensywność maski"
            className="w-full"
            style={{ accentColor: ACCENT }}
          />
          <p className="mt-1 font-mono text-[9px] tnum text-fg-low">
            mysz {derived.mouseIntensity} · jitter {derived.timestampJitterMs}ms
          </p>
        </div>

        {/* Nota o tradeoffie — uczciwie */}
        <p className="mt-2.5 text-[9px] leading-snug text-fg-low/70">
          {isFixed
            ? "Stała persona: spójna w trakcie sesji, ale ten sam profil widzą wszystkie strony (linkowalny między witrynami)."
            : "Auto: profil rotuje per-stronę — najlepsza nielinkowalność, kosztem stałości tożsamości."}
        </p>
      </div>
    </div>
  )
}
