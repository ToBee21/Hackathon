// src/popup.tsx
// Moduł C — Privacy Dashboard (popup). Lekki panel szybkiej kontroli.
//
// Po refaktorze popup zawiera tylko sterowanie i skrót stanu:
//  • Privacy Score + statystyki, przełączniki modułów, selektor Wirtualnej
//    Tożsamości, test Honeypota, Panic Button, generator aliasu e-mail, Radar.
// Widoki szczegółowe — Telemetria na żywo, Cień cyfrowy (Shadow Audit) oraz
// AI Deep-Dive — żyją wyłącznie w pełnoekranowym dashboardzie (tabs/dashboard).

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties
} from "react"

import CyberRadar, { type HoneypotEvent } from "./components/CyberRadar"
import { Crosshair, Filter, Logo, Lock, Mail, Maximize, ShieldCheck, ShieldOff } from "./components/icons"
import ModuleToggles from "./components/ModuleToggles"
import PanicButton from "./components/PanicButton"
import ScoreChart, { type ProtectionTier } from "./components/ScoreChart"
import StatCards from "./components/StatCards"
import VirtualIdentity from "./components/VirtualIdentity"
import type {
  ModuleId,
  ModuleToggleState,
  RuntimeMessage
} from "./components/types"
import {
  buildCustomBucket,
  configToExtremity,
  DEFAULT_BIONIC_BLUR_CONFIG,
  DEFAULT_CUSTOM_OS,
  extremityToConfig
} from "./shared/bionicBlurCore"
import { generateAlias } from "./shared/emailAlias"
import type { PrivacyState, ProfileBucket, ProfileId } from "./types"

import "./style.css"

const STORAGE_KEY_TOGGLES = "cnd:toggles"
const STORAGE_KEY_STATE = "cnd:state"
const STORAGE_KEY_PROFILE_ID = "cnd:bionic-blur:profile-id"
const STORAGE_KEY_CUSTOM_PROFILE = "cnd:bionic-blur:custom-profile"
const STORAGE_KEY_BIONIC_CONFIG = "cnd:bionic-blur:config"

const DEFAULT_TOGGLES: ModuleToggleState = {
  dataGhost: true,
  mouseJitter: true,
  keystroke: true,
  honeypot: true,
  cookieShredder: true,
  targetingShield: true
}

const DEFAULT_STATE: PrivacyState = {
  privacyScore: 0,
  trackersBlockedCount: 0,
  noiseGeneratedCount: 0,
  activeAliasEmail: null,
  aiDeepDiveRisk: null,
  aiDeepDiveDetectionCount: 0,
  maxCamoActive: false,
  cookiesRotatedCount: 0,
  paramsStrippedCount: 0,
  targetingBlockedCount: 0
}

const ext: typeof chrome | undefined = (globalThis as any).chrome

function computePrivacyScore(
  toggles: ModuleToggleState,
  state: PrivacyState
): number {
  let score = 0
  if (toggles.dataGhost) score += 9
  if (toggles.honeypot) score += 9
  if (toggles.cookieShredder) score += 9
  if (toggles.targetingShield) score += 9
  if (toggles.mouseJitter) score += 7
  if (toggles.keystroke) score += 7

  const activity =
    state.noiseGeneratedCount * 2 +
    state.trackersBlockedCount * 3 +
    (state.cookiesRotatedCount ?? 0) * 2 +
    (state.targetingBlockedCount ?? 0) * 1
  score += Math.min(50, activity)

  return Math.max(0, Math.min(100, score))
}

function deriveTier(armed: boolean, score: number): ProtectionTier {
  if (!armed) return "standby"
  if (score >= 70) return "protected"
  if (score >= 40) return "guarded"
  return "exposed"
}

// ─── Tab navigation ──────────────────────────────────────────────────────────

type Tab = "status" | "radar"

const TAB_LABELS: Record<Tab, string> = {
  status: "Status",
  radar: "Radar"
}

export default function Popup() {
  const [toggles, setToggles] = useState<ModuleToggleState>(DEFAULT_TOGGLES)
  const [state, setState] = useState<PrivacyState>(DEFAULT_STATE)
  const [hydrated, setHydrated] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>("status")
  const [honeypotEvents, setHoneypotEvents] = useState<HoneypotEvent[]>([])
  const [profileId, setProfileId] = useState<ProfileId>("auto")
  const [customBucket, setCustomBucket] = useState<ProfileBucket | null>(null)
  const [extremity, setExtremity] = useState<number>(
    configToExtremity(DEFAULT_BIONIC_BLUR_CONFIG)
  )

  // --- Inicjalizacja: wczytanie zapisanego stanu + nasłuch wiadomości ---
  useEffect(() => {
    if (!ext?.storage?.local) {
      setHydrated(true)
      return
    }

    ext.storage.local.get(
      [
        STORAGE_KEY_TOGGLES,
        STORAGE_KEY_STATE,
        STORAGE_KEY_PROFILE_ID,
        STORAGE_KEY_CUSTOM_PROFILE,
        STORAGE_KEY_BIONIC_CONFIG
      ],
      (result) => {
        if (result?.[STORAGE_KEY_TOGGLES]) {
          setToggles({ ...DEFAULT_TOGGLES, ...result[STORAGE_KEY_TOGGLES] })
        }
        if (result?.[STORAGE_KEY_STATE]) {
          setState({ ...DEFAULT_STATE, ...result[STORAGE_KEY_STATE] })
        }

        const storedProfileId = result?.[STORAGE_KEY_PROFILE_ID]
        if (typeof storedProfileId === "string") {
          setProfileId(storedProfileId as ProfileId)
        }
        const storedCustom = result?.[STORAGE_KEY_CUSTOM_PROFILE]
        if (storedCustom && typeof storedCustom === "object") {
          setCustomBucket(storedCustom as ProfileBucket)
        }
        const storedConfig = result?.[STORAGE_KEY_BIONIC_CONFIG] as
          | { mouseIntensity?: number }
          | undefined
        if (typeof storedConfig?.mouseIntensity === "number") {
          setExtremity(configToExtremity({ mouseIntensity: storedConfig.mouseIntensity }))
        }

        setHydrated(true)
      }
    )
  }, [])

  useEffect(() => {
    if (!ext?.runtime?.onMessage) return

    const handler = (message: RuntimeMessage) => {
      switch (message?.type) {
        case "STATE_UPDATE":
          setState((prev) => ({ ...prev, ...message.state }))
          // MaxCamo: gdy AI Deep-Dive wykryje wysokie ryzyko, zazbrój wektory.
          if (message.state.maxCamoActive) {
            setToggles((prev) => ({
              ...prev,
              dataGhost: true,
              mouseJitter: true,
              keystroke: true
            }))
          }
          break
        case "HONEYPOT_ATTACK":
          setState((prev) => ({
            ...prev,
            trackersBlockedCount: prev.trackersBlockedCount + 1
          }))
          setHoneypotEvents((prev) => [
            ...prev.slice(-50),
            {
              id: Date.now(),
              trackerName: message.payload.trackerName,
              timestamp: message.payload.timestamp
            }
          ])
          break
      }
    }

    ext.runtime.onMessage.addListener(handler)
    ext.runtime.sendMessage({ type: "REQUEST_STATE" } as RuntimeMessage)

    return () => ext.runtime.onMessage.removeListener(handler)
  }, [])

  const score = useMemo(
    () => computePrivacyScore(toggles, state),
    [toggles, state]
  )

  useEffect(() => {
    if (!hydrated || !ext?.storage?.local) return
    ext.storage.local.set({ [STORAGE_KEY_STATE]: { ...state, privacyScore: score } })
  }, [hydrated, score, state])

  // --- Akcje użytkownika ---
  const handleToggle = useCallback((module: ModuleId, enabled: boolean) => {
    setToggles((prev) => {
      const next = { ...prev, [module]: enabled }
      ext?.storage?.local?.set({ [STORAGE_KEY_TOGGLES]: next })
      return next
    })

    ext?.runtime?.sendMessage({
      type: "TOGGLE_MODULE",
      module,
      enabled
    } as RuntimeMessage)
  }, [])

  // --- Virtual Identity: wybór persony + intensywność maski ---
  const handleSelectProfile = useCallback((id: ProfileId) => {
    setProfileId(id)
    ext?.storage?.local?.set({ [STORAGE_KEY_PROFILE_ID]: id })

    // Custom bez zapisanego profilu → ustaw domyślny spójny bucket.
    if (id === "custom") {
      setCustomBucket((prev) => {
        if (prev) return prev
        const fresh = buildCustomBucket(DEFAULT_CUSTOM_OS)
        ext?.storage?.local?.set({ [STORAGE_KEY_CUSTOM_PROFILE]: fresh })
        return fresh
      })
    }
  }, [])

  const handleChangeCustom = useCallback((bucket: ProfileBucket) => {
    setCustomBucket(bucket)
    ext?.storage?.local?.set({ [STORAGE_KEY_CUSTOM_PROFILE]: bucket })
  }, [])

  const handleChangeExtremity = useCallback((value: number) => {
    setExtremity(value)
    const patch = extremityToConfig(value)
    // Scal z istniejącym configiem, by nie nadpisać pozostałych pól maski.
    ext?.storage?.local?.get(STORAGE_KEY_BIONIC_CONFIG, (res) => {
      const prev = (res?.[STORAGE_KEY_BIONIC_CONFIG] ?? {}) as Record<string, unknown>
      ext?.storage?.local?.set({
        [STORAGE_KEY_BIONIC_CONFIG]: { ...prev, ...patch }
      })
    })
  }, [])

  const handleGenerateAlias = useCallback(async () => {
    // Module D (Identity Masking) — offline path needs no API token. The alias
    // is persisted by generateAlias(); mirror it into shared state so the footer
    // reflects it and it survives a popup reopen.
    try {
      const alias = await generateAlias()
      setState((prev) => ({ ...prev, activeAliasEmail: alias.alias }))
    } catch {
      // Best-effort — błąd generowania nie wywraca UI.
    }
  }, [])

  // Demo: ręcznie wystrzel wabik do trackera, by zobaczyć pełny przepływ
  // przechwycenie → zatrucie → log. Realny log "TRAP" przyjdzie z backgroundu.
  const handleHoneypotTest = useCallback(() => {
    ext?.runtime?.sendMessage({
      type: "TRIGGER_HONEYPOT_TEST"
    } as RuntimeMessage)
  }, [])

  // Test: wymusza blackout trackerów na aktywnej karcie (bez czekania na AI).
  const handleTargetingTest = useCallback(() => {
    ext?.runtime?.sendMessage({ type: "TRIGGER_TARGETING_TEST" } as unknown as RuntimeMessage)
  }, [])

  const handlePanic = useCallback(() => {
    ext?.runtime?.sendMessage({ type: "PANIC_BUTTON" } as RuntimeMessage)
    setState(DEFAULT_STATE)
    setHoneypotEvents([])
  }, [])

  const handleOpenFullscreen = useCallback(() => {
    const url = ext?.runtime?.getURL("tabs/dashboard.html")
    if (url) ext?.tabs?.create({ url })
  }, [])

  const anyEnabled =
    toggles.dataGhost ||
    toggles.mouseJitter ||
    toggles.keystroke ||
    toggles.honeypot ||
    toggles.cookieShredder ||
    toggles.targetingShield
  const tier = deriveTier(anyEnabled, score)

  const rootStyle = {
    "--orb": anyEnabled ? "rgba(43,212,196,0.24)" : "rgba(110,116,128,0.16)"
  } as unknown as CSSProperties

  const v = (i: number) => ({ "--i": i }) as unknown as CSSProperties

  return (
    <div
      className="console relative w-[360px] font-sans text-fg-hi"
      style={rootStyle}>
      <div className="console-grid" />

      <div className="stagger relative z-[1] flex flex-col gap-3 p-4">
        {/* Header — tożsamość + pełny ekran + stan systemu */}
        <header style={v(0)} className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="edge-lit flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-fg-hi shadow-card">
              <Logo size={20} />
            </span>
            <div className="leading-tight">
              <h1 className="text-[13px] font-semibold tracking-tight text-fg-hi">
                Cloak <span className="text-fg-low">&amp;</span> Dagger
              </h1>
              <p className="text-[9px] uppercase tracking-[0.16em] text-fg-low">
                Active Privacy Defense
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pełny ekran — otwiera dashboard w nowej karcie */}
            <button
              type="button"
              onClick={handleOpenFullscreen}
              title="Otwórz dashboard na pełnym ekranie"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-fg-low transition-colors hover:text-fg-hi"
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <Maximize size={13} />
            </button>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ring-inset ${
                anyEnabled
                  ? "bg-accent-dim text-accent ring-accent/25"
                  : "bg-white/[0.03] text-fg-low ring-line-strong"
              }`}>
              <span className="relative flex h-1.5 w-1.5">
                {anyEnabled && (
                  <span className="anim-ping absolute inline-flex h-full w-full rounded-full bg-accent" />
                )}
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: anyEnabled ? "#2BD4C4" : "#6E7480" }}
                />
              </span>
              {anyEnabled ? <ShieldCheck size={12} /> : <ShieldOff size={12} />}
              <span className="text-micro font-semibold">
                {anyEnabled ? "ARMED" : "STANDBY"}
              </span>
            </span>
          </div>
        </header>

        {/* Tab navigation */}
        <div
          style={{ ...v(1), border: "1px solid rgba(255,255,255,0.06)" }}
          className="flex overflow-hidden rounded-lg">
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors duration-150"
              style={{
                background:
                  activeTab === tab ? "rgba(43,212,196,0.08)" : "transparent",
                color: activeTab === tab ? "#2BD4C4" : "#6E7480",
                borderBottom:
                  activeTab === tab ? "2px solid #2BD4C4" : "2px solid transparent"
              }}>
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* ── STATUS TAB ── */}
        {activeTab === "status" && (
          <>
            {/* Privacy Score — hero */}
            <div style={v(2)} className="pt-1">
              <ScoreChart
                score={score}
                tier={tier}
                armed={anyEnabled}
                noiseCount={state.noiseGeneratedCount}
                trackerCount={state.trackersBlockedCount}
              />
            </div>

            {/* Statystyki */}
            <div style={v(3)}>
              <StatCards state={state} />
            </div>

            {/* Przełączniki modułów + demo Honeypota */}
            <div style={v(4)} className="flex flex-col gap-2">
              <ModuleToggles toggles={toggles} onToggle={handleToggle} />

              {toggles.honeypot && (
                <button
                  type="button"
                  onClick={handleHoneypotTest}
                  className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-[11px] font-medium transition-colors duration-base hover:bg-white/[0.03]"
                  style={{ borderColor: "#FF5C7A55", color: "#FF5C7A" }}>
                  <Crosshair size={13} />
                  Testuj Honeypot · wyślij wabik do trackera
                </button>
              )}

              {toggles.targetingShield && (
                <button
                  type="button"
                  onClick={handleTargetingTest}
                  className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-[11px] font-medium transition-colors duration-base hover:bg-white/[0.03]"
                  style={{ borderColor: "#3DD4A055", color: "#3DD4A0" }}>
                  <Filter size={13} />
                  Testuj Targeting Shield · blackout tej strony
                </button>
              )}
            </div>

            {/* Wirtualna tożsamość — selektor person + intensywność maski */}
            <div style={v(5)}>
              <VirtualIdentity
                profileId={profileId}
                customBucket={customBucket}
                extremity={extremity}
                onSelectProfile={handleSelectProfile}
                onChangeExtremity={handleChangeExtremity}
                onChangeCustom={handleChangeCustom}
              />
            </div>

            {/* Skrót do widoków szczegółowych — Telemetria, AI, Cień cyfrowy */}
            <button
              type="button"
              style={v(6)}
              onClick={handleOpenFullscreen}
              className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium text-fg-mid ring-1 ring-inset ring-line-strong transition-colors hover:text-fg-hi hover:ring-line-hover">
              <Maximize size={13} />
              Telemetria na żywo · AI Deep-Dive · Cień cyfrowy
            </button>

            {/* Panic — hold-to-wipe */}
            <div style={v(6)}>
              <PanicButton onPanic={handlePanic} />
            </div>

            {/* Stopka — tożsamość jednorazowa + sygnał zaufania */}
            <div style={v(7)} className="flex flex-col items-center gap-1.5 pt-0.5">
              {state.activeAliasEmail ? (
                <p className="text-[10px] text-fg-low">
                  Alias:{" "}
                  <span className="font-mono text-fg-mid">
                    {state.activeAliasEmail}
                  </span>{" "}
                  <button
                    type="button"
                    onClick={handleGenerateAlias}
                    className="text-accent/80 transition-colors hover:text-accent">
                    nowy
                  </button>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerateAlias}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] px-2.5 py-1 text-[10px] text-fg-mid ring-1 ring-inset ring-line-strong transition-colors hover:text-fg-hi hover:ring-line-hover">
                  <Mail size={11} /> Generuj alias e-mail
                </button>
              )}
              <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-fg-low/70">
                <Lock size={10} /> Privacy-by-Design · dane lokalne
              </p>
            </div>
          </>
        )}

        {/* ── RADAR TAB ── */}
        {activeTab === "radar" && (
          <div style={v(2)} className="flex flex-col items-center gap-3">
            {honeypotEvents.length === 0 && (
              <p
                className="pt-1 text-center text-[10px] text-fg-low"
                style={{ maxWidth: 220 }}>
                Radar czeka na rzeczywiste zdarzenia. Wejdź na stronę z trackerami
                lub użyj przycisku „Testuj Honeypot" w zakładce Status.
              </p>
            )}
            <CyberRadar
              armed={anyEnabled}
              honeypotEvents={honeypotEvents}
              noiseCount={state.noiseGeneratedCount}
              size={312}
            />
            <div className="flex gap-4 text-[10px] text-fg-low">
              <span>
                <span style={{ color: "#E5484D" }}>●</span>{" "}
                {state.trackersBlockedCount} zatrutych trackerów
              </span>
              <span>
                <span style={{ color: "#9A8CFF" }}>●</span>{" "}
                {state.noiseGeneratedCount} wstrzyknięć szumu
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grain-layer" />
    </div>
  )
}
