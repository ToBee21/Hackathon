// src/components/VirtualIdentityStudio.tsx
//
// „Wirtualna Tożsamość" — pełnoekranowy kreator postaci (styl RPG / The Sims),
// który konfiguruje profil widziany przez algorytmy śledzące. Układ dwukolumnowy:
//
//   LEWA (kontrola)  — u góry siatka kart presetów w zakładkach Domyślne/Specjalne,
//                      u dołu ręczna edycja: płeć, wiek, sprzęt (suwak), pochodzenie,
//                      zainteresowania (tagi).
//   PRAWA (wizualna) — animowana sylwetka dostosowana do presetu + trzy statystyki
//                      pochodne (Zamożność / Technika / Mobilność) na suwakach.
//
// Komponent działa jako controlled (value+onChange) LUB uncontrolled (defaultValue).
// onApply oddaje gotowy ProfileBucket + tematy szumu do zapisania przez rodzica.

import { useMemo, useState, type CSSProperties } from "react"

import grandmaModelUrl from "url:../../assets/models/grandma.stl"

import {
  AGE_BANDS,
  ARCHETYPES,
  DEFAULT_IDENTITY,
  GENDERS,
  HARDWARE_TIERS,
  INTERESTS,
  ORIGINS,
  applyArchetype,
  deriveStats,
  getArchetype,
  getHardwareSpec,
  getOriginSpec,
  hardwareFromIndex,
  HARDWARE_INDEX,
  identityEquals,
  identityToNoiseTopics,
  identityToProfileBucket,
  reconcileArchetype,
  type AgeBand,
  type Archetype,
  type Gender,
  type IdentityStats,
  type InterestId,
  type OriginId,
  type VirtualIdentityConfig
} from "../shared/virtualIdentityStudio"
import type { ProfileBucket } from "../types"
import { Aperture, Cursor, Fingerprint, Ghost, ShieldCheck } from "./icons"
import StlModelViewer from "./StlModelViewer"

const ACCENT = "#2BD4C4"

export interface IdentityDerived {
  bucket: ProfileBucket
  topics: string[]
  stats: IdentityStats
}

interface VirtualIdentityStudioProps {
  value?: VirtualIdentityConfig
  defaultValue?: VirtualIdentityConfig
  /** Ostatnio aktywowana (zapisana) tożsamość — steruje stanem przycisku. */
  activeConfig?: VirtualIdentityConfig | null
  onChange?: (config: VirtualIdentityConfig) => void
  onApply?: (config: VirtualIdentityConfig, derived: IdentityDerived) => void
}

// ===========================================================================
//  Sylwetka postaci — parametryczny SVG (placeholder na model 3D)
// ===========================================================================

function CharacterSilhouette({
  gender,
  ageBand,
  toneId
}: {
  gender: Gender
  ageBand: AgeBand
  toneId: string
}) {
  // Wiek skaluje całą sylwetkę i decyduje o atrybutach (laska emeryta).
  const scale = ageBand === "teen" ? 0.9 : ageBand === "senior" ? 0.94 : 1
  const senior = ageBand === "senior"
  const female = gender === "female"
  // Płeć: szerokość barków i sylwetka tułowia.
  const shoulder = female ? 17 : 22

  return (
    <svg
      viewBox="0 0 120 170"
      width="100%"
      height="100%"
      role="img"
      aria-label={`Sylwetka: ${female ? "kobieta" : "mężczyzna"}, ${ageBand}`}
      style={{ maxHeight: 320 }}>
      <defs>
        <radialGradient id={`aura-${toneId}`} cx="50%" cy="38%" r="60%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
          <stop offset="55%" stopColor={ACCENT} stopOpacity="0.08" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`body-${toneId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7CF3E8" />
          <stop offset="100%" stopColor={ACCENT} />
        </linearGradient>
      </defs>

      {/* Aura / glow tła */}
      <ellipse cx="60" cy="64" rx="52" ry="60" fill={`url(#aura-${toneId})`} />

      {/* Cień pod postacią */}
      <ellipse cx="60" cy="158" rx="26" ry="5" fill={ACCENT} opacity="0.14" />

      {/* Animacja floaty (CSS transform) na zewnętrznym <g>, skala/pozycja
          (atrybut transform) na wewnętrznym — inaczej CSS nadpisałby skalę. */}
      <g className="anim-floaty">
      <g
        transform={`translate(60 ${senior ? 90 : 86}) scale(${scale}) translate(-60 -86)`}
        stroke={`url(#body-${toneId})`}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none">
        {/* Włosy (kobieta — dłuższe za barkami) */}
        {female && (
          <path
            d="M48 26 Q46 44 50 56 M72 26 Q74 44 70 56"
            strokeWidth="2"
            opacity="0.85"
          />
        )}
        {/* Głowa */}
        <circle cx="60" cy="28" r="12.5" fill="rgba(43,212,196,0.10)" />
        {/* Szyja */}
        <path d="M60 40.5 V47" />

        {/* Tułów + ramiona (lekkie pochylenie u emeryta) */}
        <path
          d={
            senior
              ? `M60 47 L${60 - shoulder} 60 M60 47 L${60 + shoulder - 4} 59 M60 47 V96`
              : `M60 47 L${60 - shoulder} 62 M60 47 L${60 + shoulder} 62 M60 47 V98`
          }
        />
        {/* Talia / biodra (kobieta — zaznaczona) */}
        {female ? (
          <path d="M52 96 Q60 104 68 96" />
        ) : (
          <path d="M53 98 H67" />
        )}

        {/* Ramiona w dół */}
        <path
          d={
            senior
              ? `M${60 - shoulder} 60 Q34 76 38 92 M${60 + shoulder - 4} 59 Q86 74 82 90`
              : `M${60 - shoulder} 62 Q34 80 40 98 M${60 + shoulder} 62 Q86 80 80 98`
          }
        />

        {/* Nogi */}
        {female ? (
          <path d="M55 100 Q52 124 50 148 M65 100 Q68 124 70 148" />
        ) : (
          <path d="M54 100 L50 150 M66 100 L70 150" />
        )}

        {/* Laska emeryta */}
        {senior && <path d="M84 92 L88 150" strokeWidth="2" opacity="0.9" />}
      </g>
      </g>
    </svg>
  )
}

// ===========================================================================
//  Małe elementy kontrolne
// ===========================================================================

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-fg-low">{label}</span>
        <span className="font-mono text-[10px] tnum" style={{ color: ACCENT }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-base ease-standard"
          style={{
            width: `${value}%`,
            background: `linear-gradient(90deg, ${ACCENT}, #7CF3E8)`
          }}
        />
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel
}: {
  options: { id: T; label: string; sub?: string }[]
  value: T
  onChange: (id: T) => void
  ariaLabel: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className="flex-1 rounded-lg px-2.5 py-1.5 text-center transition-colors duration-base"
            style={{
              backgroundColor: active ? `${ACCENT}1a` : "rgba(255,255,255,0.04)",
              boxShadow: active
                ? `inset 0 0 0 1px ${ACCENT}`
                : "inset 0 0 0 1px rgba(255,255,255,0.06)"
            }}>
            <span
              className="block whitespace-nowrap text-[11px] font-medium"
              style={{ color: active ? ACCENT : "#C9CDD6" }}>
              {o.label}
            </span>
            {o.sub && (
              <span className="block text-[9px] leading-tight text-fg-low">{o.sub}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-low">
      {children}
    </p>
  )
}

// ===========================================================================
//  Główny komponent
// ===========================================================================

export default function VirtualIdentityStudio({
  value,
  defaultValue,
  activeConfig,
  onChange,
  onApply
}: VirtualIdentityStudioProps) {
  const [internal, setInternal] = useState<VirtualIdentityConfig>(
    value ?? defaultValue ?? DEFAULT_IDENTITY
  )
  const config = value ?? internal

  const [tab, setTab] = useState<"default" | "special">("default")

  const update = (next: VirtualIdentityConfig) => {
    if (value === undefined) setInternal(next)
    onChange?.(next)
  }

  // Ręczna zmiana pojedynczego parametru → przelicz znacznik archetypu.
  const patch = (partial: Partial<Omit<VirtualIdentityConfig, "archetypeId">>) => {
    const merged = {
      gender: config.gender,
      ageBand: config.ageBand,
      hardware: config.hardware,
      origin: config.origin,
      interests: config.interests,
      ...partial
    }
    update(reconcileArchetype(merged))
  }

  const toggleInterest = (id: InterestId) => {
    const has = config.interests.includes(id)
    patch({
      interests: has
        ? config.interests.filter((i) => i !== id)
        : [...config.interests, id]
    })
  }

  const stats = useMemo(() => deriveStats(config), [config])
  const hw = getHardwareSpec(config.hardware)
  const origin = getOriginSpec(config.origin)
  const activeArchetype: Archetype | undefined =
    config.archetypeId !== "custom" ? getArchetype(config.archetypeId) : undefined

  const presets = ARCHETYPES.filter((a) => a.category === tab)

  // Czy edytowana tożsamość jest dokładnie tą zapisaną (aktywną).
  const isActive = activeConfig != null && identityEquals(config, activeConfig)
  const activeName =
    activeConfig == null
      ? null
      : activeConfig.archetypeId === "custom"
        ? "Custom"
        : getArchetype(activeConfig.archetypeId)?.name ?? activeConfig.archetypeId

  const handleApply = () => {
    onApply?.(config, {
      bucket: identityToProfileBucket(config),
      topics: identityToNoiseTopics(config),
      stats
    })
  }

  const toneId = config.archetypeId

  return (
    <section className="overflow-hidden rounded-2xl bg-surface-1 shadow-card ring-1 ring-inset ring-line">
      {/* Nagłówek */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Fingerprint size={16} className="text-accent" />
          <div className="leading-tight">
            <h2 className="text-[13px] font-semibold tracking-tight text-fg-hi">
              Wirtualna Tożsamość
            </h2>
            <p className="text-[9px] uppercase tracking-[0.16em] text-fg-low">
              Kreator profilu widzianego przez trackery
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide"
          style={{
            backgroundColor: `${ACCENT}14`,
            color: ACCENT,
            boxShadow: `inset 0 0 0 1px ${ACCENT}40`
          }}>
          {config.archetypeId === "custom" ? (
            <>
              <Cursor size={11} /> custom
            </>
          ) : (
            <>
              <Aperture size={11} /> {activeArchetype?.name ?? config.archetypeId}
            </>
          )}
        </span>
      </header>

      <div className="grid gap-0 lg:grid-cols-[1fr_300px]">
        {/* ============ LEWA: KONTROLA ============ */}
        <div className="border-line p-4 lg:border-r">
          {/* Zakładki presetów */}
          <div className="mb-3 inline-flex rounded-lg bg-white/[0.04] p-0.5">
            {(["default", "special"] as const).map((t) => {
              const active = t === tab
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className="rounded-md px-3 py-1 text-[11px] font-medium transition-colors duration-base"
                  style={{
                    backgroundColor: active ? `${ACCENT}1f` : "transparent",
                    color: active ? ACCENT : "#9AA0AB"
                  }}>
                  {t === "default" ? "Domyślne" : "Specjalne"}
                </button>
              )
            })}
          </div>

          {/* Siatka kart archetypów */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 xl:grid-cols-2">
            {presets.map((a) => {
              const active = config.archetypeId === a.id
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => update(applyArchetype(a))}
                  className="group relative overflow-hidden rounded-xl px-3 py-2.5 text-left transition-all duration-base"
                  style={{
                    backgroundColor: active ? `${ACCENT}14` : "rgba(255,255,255,0.03)",
                    boxShadow: active
                      ? `inset 0 0 0 1px ${ACCENT}, 0 0 0 3px ${ACCENT}1f`
                      : "inset 0 0 0 1px rgba(255,255,255,0.06)"
                  }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: active ? `${ACCENT}22` : "rgba(255,255,255,0.04)",
                        color: active ? ACCENT : "#8A909C"
                      }}>
                      {a.category === "special" ? (
                        <Ghost size={15} />
                      ) : (
                        <ShieldCheck size={15} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="truncate text-[12px] font-semibold"
                        style={{ color: active ? ACCENT : "#E4E6EA" }}>
                        {a.name}
                      </p>
                      <p className="truncate text-[9.5px] leading-tight text-fg-low">
                        {a.tagline}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* ---- Ręczna edycja ---- */}
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-mid">
              <Cursor size={12} className="text-accent" />
              Dostosuj ręcznie
            </p>

            <div className="grid gap-3.5 sm:grid-cols-2">
              {/* Płeć */}
              <div>
                <FieldLabel>Płeć</FieldLabel>
                <Segmented<Gender>
                  ariaLabel="Płeć profilu"
                  options={GENDERS.map((g) => ({ id: g.id, label: g.label }))}
                  value={config.gender}
                  onChange={(id) => patch({ gender: id })}
                />
              </div>

              {/* Pochodzenie */}
              <div>
                <FieldLabel>Cyfrowe pochodzenie</FieldLabel>
                <div className="relative">
                  <select
                    value={config.origin}
                    onChange={(e) => patch({ origin: e.target.value as OriginId })}
                    aria-label="Cyfrowe pochodzenie"
                    className="w-full appearance-none rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-fg-hi outline-none ring-1 ring-inset ring-line transition-colors focus:ring-accent/60">
                    {ORIGINS.map((o) => (
                      <option key={o.id} value={o.id} className="bg-surface-2 text-fg-hi">
                        {o.code} · {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-low">
                    ▾
                  </span>
                </div>
              </div>

              {/* Wiek */}
              <div className="sm:col-span-2">
                <FieldLabel>Przedział wiekowy</FieldLabel>
                <Segmented<AgeBand>
                  ariaLabel="Przedział wiekowy"
                  options={AGE_BANDS.map((a) => ({
                    id: a.id,
                    label: a.label,
                    sub: a.short
                  }))}
                  value={config.ageBand}
                  onChange={(id) => patch({ ageBand: id })}
                />
              </div>

              {/* Sprzęt — suwak */}
              <div className="sm:col-span-2">
                <div className="mb-1 flex items-baseline justify-between">
                  <FieldLabel>Specyfikacja komputera</FieldLabel>
                  <span className="text-[10px] font-medium" style={{ color: ACCENT }}>
                    {hw.label}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={HARDWARE_INDEX[config.hardware]}
                  onChange={(e) => patch({ hardware: hardwareFromIndex(Number(e.target.value)) })}
                  aria-label="Specyfikacja komputera"
                  className="w-full"
                  style={{ accentColor: ACCENT }}
                />
                <div className="mt-0.5 flex justify-between text-[9px] text-fg-low">
                  <span>Tani laptop</span>
                  <span>Biurowy</span>
                  <span>Maszyna do gier</span>
                </div>
                <p className="mt-1 font-mono text-[9.5px] tnum text-fg-low">{hw.blurb}</p>
              </div>

              {/* Zainteresowania */}
              <div className="sm:col-span-2">
                <FieldLabel>Zainteresowania · tematy szumu</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {INTERESTS.map((it) => {
                    const active = config.interests.includes(it.id)
                    return (
                      <button
                        key={it.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleInterest(it.id)}
                        className="rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors duration-base"
                        style={{
                          backgroundColor: active ? `${ACCENT}1f` : "rgba(255,255,255,0.04)",
                          color: active ? ACCENT : "#9AA0AB",
                          boxShadow: active
                            ? `inset 0 0 0 1px ${ACCENT}`
                            : "inset 0 0 0 1px rgba(255,255,255,0.06)"
                        }}>
                        {it.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============ PRAWA: WIZUALNA ============ */}
        <aside className="flex flex-col gap-3 bg-gradient-to-b from-white/[0.02] to-transparent p-4">
          {/* Podgląd postaci */}
          <div className="relative flex items-center justify-center overflow-hidden rounded-xl bg-void/60 ring-1 ring-inset ring-line">
            <div className="console-grid absolute inset-0 opacity-60" />
            {config.archetypeId === "granny" ? (
              // Babcia — obracający się model 3D zamiast sylwetki SVG.
              <div className="h-[320px] w-full">
                <StlModelViewer src={grandmaModelUrl} />
              </div>
            ) : (
              <div className="relative anim-pulse py-3">
                <CharacterSilhouette
                  gender={config.gender}
                  ageBand={config.ageBand}
                  toneId={toneId}
                />
              </div>
            )}
            <span className="absolute left-3 top-3 font-mono text-[9px] uppercase tracking-wide text-fg-low">
              {origin.code} · {origin.timezone.split("/")[1]?.replace("_", " ") ?? origin.timezone}
            </span>
            <span className="absolute right-3 top-3 font-mono text-[9px] uppercase tracking-wide text-fg-low">
              {hw.cores}c · {hw.ramGb}GB
            </span>
          </div>

          {/* Statystyki pochodne */}
          <div className="flex flex-col gap-2.5 rounded-xl bg-white/[0.03] p-3">
            <StatBar label="Zamożność" value={stats.wealth} />
            <StatBar label="Zaawansowanie techniczne" value={stats.tech} />
            <StatBar label="Mobilność" value={stats.mobility} />
          </div>

          {/* Podsumowanie maski */}
          <div className="rounded-xl bg-white/[0.03] p-3">
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-low">
              Profil dla trackerów
            </p>
            <dl className="flex flex-col gap-1 font-mono text-[10px] text-fg-mid">
              <div className="flex justify-between gap-2">
                <dt className="text-fg-low">GPU</dt>
                <dd className="truncate" title={hw.gpu}>
                  {hw.gpu}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-fg-low">Ekran</dt>
                <dd>
                  {hw.screen.width}×{hw.screen.height}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-fg-low">Język</dt>
                <dd>{origin.locale}</dd>
              </div>
            </dl>
          </div>

          {onApply && (
            <div className="mt-auto flex flex-col gap-1.5">
              {/* Status zapisanej tożsamości */}
              <div className="flex items-center justify-between text-[10px]">
                {activeName ? (
                  <span className="flex items-center gap-1.5 text-fg-mid">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }}
                    />
                    Aktywna: <span className="font-medium text-fg-hi">{activeName}</span>
                  </span>
                ) : (
                  <span className="text-fg-low">Brak zapisanej tożsamości</span>
                )}
                {!isActive && activeName && (
                  <span style={{ color: "#F5A623" }}>● niezapisane zmiany</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleApply}
                disabled={isActive}
                aria-disabled={isActive}
                className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold transition-colors duration-base disabled:cursor-default"
                style={
                  isActive
                    ? {
                        backgroundColor: "rgba(255,255,255,0.04)",
                        color: ACCENT,
                        boxShadow: `inset 0 0 0 1px ${ACCENT}55`
                      }
                    : {
                        backgroundColor: ACCENT,
                        color: "#06201D",
                        boxShadow: `0 0 0 3px ${ACCENT}26`
                      }
                }>
                <ShieldCheck size={14} />
                {isActive ? "Tożsamość aktywna" : "Aktywuj tożsamość"}
              </button>
              <p className="text-center text-[9px] leading-snug text-fg-low/70">
                Zapisana lokalnie do momentu zmiany — każda strona zobaczy ten profil.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
