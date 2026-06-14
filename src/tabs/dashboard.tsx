// src/tabs/dashboard.tsx
// Pełnoekranowy Dashboard  -  otwierany przyciskiem w popup.
// Plasmo automatycznie kompiluje ten plik do tabs/dashboard.html.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react"

import AiDeepDiveCard from "../components/AiDeepDiveCard"
import CyberRadar, { type HoneypotEvent } from "../components/CyberRadar"
import { FloatingPanelToggle } from "../components/FloatingPanelToggle"
import { Crosshair, Filter, Lock, Logo, Mail, ShieldCheck, ShieldOff } from "../components/icons"
import LoggerView from "../components/LoggerView"
import ModuleToggles from "../components/ModuleToggles"
import PanicButton from "../components/PanicButton"
import ScoreChart, { type ProtectionTier } from "../components/ScoreChart"
import ShadowAudit from "../components/ShadowAudit"
import StatCards from "../components/StatCards"
import VirtualIdentityStudio, {
  type IdentityDerived,
} from "../components/VirtualIdentityStudio"
import {
  DEFAULT_IDENTITY,
  getArchetype,
  normalizeVirtualIdentityConfig,
  type VirtualIdentityConfig,
} from "../shared/virtualIdentityStudio"
import type {
  LogEntry,
  ModuleId,
  ModuleToggleState,
  RuntimeMessage,
} from "../components/types"
import {
  DEFAULT_AI_DEEP_DIVE_CONFIG,
  STORAGE_KEY_AI_DEEP_DIVE_CONFIG,
  normalizeAiDeepDiveConfig,
  type AiDeepDiveRuntimeConfig,
} from "../shared/aiDeepDive/config"
import { generateAlias } from "../shared/emailAlias"
import { collectShadowProfile } from "../shared/shadowAudit"
import { collectDataExport } from "../shared/dataExport/collectExport"
import { serializeDataExport } from "../shared/dataExport/buildExport"
import { downloadJson } from "../shared/dataExport/download"
import type { PrivacyState } from "../types"

import "../style.css"

const STORAGE_KEY_TOGGLES = "cnd:toggles"
const STORAGE_KEY_STATE = "cnd:state"
const STORAGE_KEY_VIRTUAL_IDENTITY = "cnd:virtual-identity"
const STORAGE_KEY_VIRTUAL_IDENTITY_ACTIVE = "cnd:virtual-identity:active"
const STORAGE_KEY_PROFILE_ID = "cnd:bionic-blur:profile-id"
const STORAGE_KEY_CUSTOM_PROFILE = "cnd:bionic-blur:custom-profile"
const STORAGE_KEY_NOISE_TOPICS = "cnd:dataghost:topics"
const MAX_LOG_ENTRIES = 50
const LOG_COLLAPSE_WINDOW_MS = 8000

function persistablePrivacyState(state: PrivacyState, privacyScore: number): PrivacyState {
  return { ...state, privacyScore, activeAliasEmail: null }
}

const DEFAULT_TOGGLES: ModuleToggleState = {
  dataGhost: true,
  mouseJitter: true,
  keystroke: true,
  honeypot: true,
  cookieShredder: true,
  targetingShield: true,
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
  targetingBlockedCount: 0,
}

const ext: typeof chrome | undefined = (globalThis as any).chrome

function computePrivacyScore(toggles: ModuleToggleState, state: PrivacyState): number {
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

let logCounter = 0
function makeLogId(): string {
  return `${Date.now()}-${++logCounter}`
}

export default function Dashboard() {
  const [toggles, setToggles] = useState<ModuleToggleState>(DEFAULT_TOGGLES)
  const [state, setState] = useState<PrivacyState>(DEFAULT_STATE)
  const [aiDeepDiveConfig, setAiDeepDiveConfig] = useState<AiDeepDiveRuntimeConfig>(DEFAULT_AI_DEEP_DIVE_CONFIG)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [honeypotEvents, setHoneypotEvents] = useState<HoneypotEvent[]>([])
  const [identity, setIdentity] = useState<VirtualIdentityConfig>(DEFAULT_IDENTITY)
  const [activeIdentity, setActiveIdentity] = useState<VirtualIdentityConfig | null>(null)

  const addLog = useCallback((entry: Omit<LogEntry, "id">) => {
    setLogs((prev) => {
      const latest = prev[0]
      if (
        latest &&
        latest.source === entry.source &&
        latest.message === entry.message &&
        Math.abs(entry.timestamp - latest.timestamp) <= LOG_COLLAPSE_WINDOW_MS
      ) {
        return [
          { ...latest, timestamp: entry.timestamp, count: (latest.count ?? 1) + (entry.count ?? 1) },
          ...prev.slice(1),
        ]
      }
      return [{ ...entry, id: makeLogId(), count: entry.count ?? 1 }, ...prev].slice(0, MAX_LOG_ENTRIES)
    })
  }, [])

  useEffect(() => {
    if (!ext?.storage?.local) { setHydrated(true); return }
    ext.storage.local.get([STORAGE_KEY_TOGGLES, STORAGE_KEY_STATE, STORAGE_KEY_AI_DEEP_DIVE_CONFIG, STORAGE_KEY_VIRTUAL_IDENTITY, STORAGE_KEY_VIRTUAL_IDENTITY_ACTIVE], (result) => {
      if (result?.[STORAGE_KEY_TOGGLES]) setToggles({ ...DEFAULT_TOGGLES, ...result[STORAGE_KEY_TOGGLES] })
      if (result?.[STORAGE_KEY_STATE]) setState({ ...DEFAULT_STATE, ...result[STORAGE_KEY_STATE] })
      if (result?.[STORAGE_KEY_VIRTUAL_IDENTITY]) {
        setIdentity(normalizeVirtualIdentityConfig(result[STORAGE_KEY_VIRTUAL_IDENTITY]))
      }
      if (result?.[STORAGE_KEY_VIRTUAL_IDENTITY_ACTIVE]) {
        setActiveIdentity(normalizeVirtualIdentityConfig(result[STORAGE_KEY_VIRTUAL_IDENTITY_ACTIVE]))
      }
      setAiDeepDiveConfig(normalizeAiDeepDiveConfig(result?.[STORAGE_KEY_AI_DEEP_DIVE_CONFIG]))
      setHydrated(true)
    })
  }, [])

  useEffect(() => {
    if (!ext?.runtime?.onMessage) return
    const handler = (message: RuntimeMessage) => {
      switch (message?.type) {
        case "LOG_EVENT":
          addLog(message.entry)
          break
        case "STATE_UPDATE":
          setState((prev) => ({ ...prev, ...message.state }))
          // MaxCamo: gdy AI Deep-Dive wykryje wysokie ryzyko, zazbrój wektory.
          if (message.state.maxCamoActive) {
            setToggles((prev) => ({ ...prev, dataGhost: true, mouseJitter: true, keystroke: true }))
          }
          break
        case "HONEYPOT_ATTACK":
          setState((prev) => ({ ...prev, trackersBlockedCount: prev.trackersBlockedCount + 1 }))
          setHoneypotEvents((prev) => [
            ...prev.slice(-50),
            { id: Date.now(), trackerName: message.payload.trackerName, timestamp: message.payload.timestamp },
          ])
          addLog({
            timestamp: message.payload.timestamp,
            source: "honeypot",
            message: `Zatruty tracker: ${message.payload.trackerName}`,
          })
          break
      }
    }
    ext.runtime.onMessage.addListener(handler)
    ext.runtime.sendMessage({ type: "REQUEST_STATE" } as RuntimeMessage)
    return () => ext.runtime.onMessage.removeListener(handler)
  }, [addLog])

  const score = useMemo(() => computePrivacyScore(toggles, state), [toggles, state])

  useEffect(() => {
    if (!hydrated || !ext?.storage?.local) return
    ext.storage.local.set({
      [STORAGE_KEY_STATE]: persistablePrivacyState(state, score)
    })
  }, [hydrated, score, state])

  const handleToggle = useCallback((module: ModuleId, enabled: boolean) => {
    setToggles((prev) => {
      const next = { ...prev, [module]: enabled }
      ext?.storage?.local?.set({ [STORAGE_KEY_TOGGLES]: next })
      return next
    })
    ext?.runtime?.sendMessage({ type: "TOGGLE_MODULE", module, enabled } as RuntimeMessage)
    addLog({ timestamp: Date.now(), source: "system", message: `${enabled ? "Włączono" : "Wyłączono"} moduł: ${module}` })
  }, [addLog])

  const handleToggleAiDeepDiveMode = useCallback((enabled: boolean) => {
    const next = { ...aiDeepDiveConfig, aiModeEnabled: enabled }
    setAiDeepDiveConfig(next)
    ext?.storage?.local?.set({ [STORAGE_KEY_AI_DEEP_DIVE_CONFIG]: next })
    addLog({
      timestamp: Date.now(),
      source: "aiDeepDive",
      message: enabled ? "AI Deep-Dive: lokalny HF/NLI wlaczony" : "AI Deep-Dive: lokalny HF/NLI wylaczony",
    })
  }, [addLog, aiDeepDiveConfig])

  const handleGenerateAlias = useCallback(async () => {
    try {
      const alias = await generateAlias()
      setState((prev) => ({ ...prev, activeAliasEmail: alias.alias }))
      addLog({ timestamp: Date.now(), source: "system", message: "Wygenerowano alias e-mail: [redacted]" })
    } catch {
      addLog({ timestamp: Date.now(), source: "system", message: "Nie udało się wygenerować aliasu e-mail" })
    }
  }, [addLog])

  const handleHoneypotTest = useCallback(() => {
    ext?.runtime?.sendMessage({ type: "TRIGGER_HONEYPOT_TEST" } as RuntimeMessage)
    addLog({ timestamp: Date.now(), source: "honeypot", message: "Wysłano wabik do Google Analytics  -  czekam na zatrucie…" })
  }, [addLog])

  // Test: wymusza blackout trackerów na aktywnej karcie (bez czekania na AI).
  const handleTargetingTest = useCallback(() => {
    ext?.runtime?.sendMessage({ type: "TRIGGER_TARGETING_TEST" } as unknown as RuntimeMessage)
    addLog({ timestamp: Date.now(), source: "system", message: "Targeting Shield: wymuszono blackout trackerów na aktywnej karcie" })
  }, [addLog])

  const handleIdentityChange = useCallback((next: VirtualIdentityConfig) => {
    setIdentity(next)
    ext?.storage?.local?.set({ [STORAGE_KEY_VIRTUAL_IDENTITY]: next })
  }, [])

  // Aktywacja tożsamości → wymuś personę Custom w potoku fingerprintu (realny
  // efekt na bionicBlurCore) i zapisz tematy szumu dla DataGhost.
  const handleIdentityApply = useCallback(
    (config: VirtualIdentityConfig, derived: IdentityDerived) => {
      setActiveIdentity(config)
      ext?.storage?.local?.set({
        [STORAGE_KEY_VIRTUAL_IDENTITY]: config,
        [STORAGE_KEY_VIRTUAL_IDENTITY_ACTIVE]: config,
        [STORAGE_KEY_PROFILE_ID]: "custom",
        [STORAGE_KEY_CUSTOM_PROFILE]: derived.bucket,
        [STORAGE_KEY_NOISE_TOPICS]: derived.topics,
      })
      const name =
        config.archetypeId === "custom"
          ? "Custom"
          : getArchetype(config.archetypeId)?.name ?? config.archetypeId
      addLog({
        timestamp: Date.now(),
        source: "system",
        message: `Aktywowano tożsamość: ${name}  -  ${derived.bucket.hardwareConcurrency} rdzeni · ${derived.bucket.locale} · ${derived.topics.length} tematów szumu`,
      })
    },
    [addLog],
  )

  const handlePanic = useCallback(() => {
    ext?.runtime?.sendMessage({ type: "PANIC_BUTTON" } as RuntimeMessage)
    setLogs([])
    setState(DEFAULT_STATE)
    setHoneypotEvents([])
    setIdentity(DEFAULT_IDENTITY)
    setActiveIdentity(null)
    addLog({ timestamp: Date.now(), source: "system", message: "PANIC: wyczyszczono sesje śledzące i dane lokalne" })
  }, [addLog])

  // „Twoje dane" — eksport CAŁEGO lokalnego stanu do JSON (suwerenność danych).
  // Sekrety (token API, klucz crypto) są twardo redagowane w buildDataExport.
  const handleExportData = useCallback(async () => {
    try {
      const shadowAudit = collectShadowProfile()
      const appVersion = ext?.runtime?.getManifest?.().version ?? "0.1.0"
      const bundle = await collectDataExport({ shadowAudit, appVersion })
      const stamp = bundle.exportedAt.slice(0, 19).replace(/[:T]/g, "-")
      downloadJson(`privacymyst-moje-dane-${stamp}.json`, serializeDataExport(bundle))
      const n = bundle.redactedKeys.length
      addLog({
        timestamp: Date.now(),
        source: "system",
        message: `Eksport danych: pobrano JSON (${n} ${n === 1 ? "sekret zredagowany" : "sekretów zredagowanych"}).`,
      })
    } catch {
      addLog({ timestamp: Date.now(), source: "system", message: "Nie udało się wyeksportować danych." })
    }
  }, [addLog])

  const anyEnabled =
    toggles.dataGhost || toggles.mouseJitter || toggles.keystroke || toggles.honeypot ||
    toggles.cookieShredder || toggles.targetingShield
  const tier = deriveTier(anyEnabled, score)

  const rootStyle = {
    "--orb": anyEnabled ? "rgba(43,212,196,0.24)" : "rgba(110,116,128,0.16)",
  } as unknown as CSSProperties

  return (
    <div
      className="console font-sans text-fg-hi min-h-screen"
      style={{ ...rootStyle, background: "#0A0B0E" }}
    >
      <div className="console-grid" />

      <div className="relative z-[1] flex flex-col gap-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <span className="edge-lit flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 shadow-card">
              <Logo size={20} />
            </span>
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold tracking-tight text-fg-hi">
                PrivacyMyst
              </h1>
              <p className="text-[9px] uppercase tracking-[0.16em] text-fg-low">
                Privacy Intelligence Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex gap-6 text-[11px] text-fg-low">
              <span>
                <span style={{ color: "#E5484D" }}>●</span>{" "}
                <span className="text-fg-mid font-semibold">{state.trackersBlockedCount}</span> zatrutych trackerów
              </span>
              <span>
                <span style={{ color: "#9A8CFF" }}>●</span>{" "}
                <span className="text-fg-mid font-semibold">{state.noiseGeneratedCount}</span> wstrzyknięć szumu
              </span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 ring-inset text-[11px] font-semibold ${
                anyEnabled
                  ? "bg-accent-dim text-accent ring-accent/25"
                  : "bg-white/[0.03] text-fg-low ring-line-strong"
              }`}
            >
              <span className="relative flex h-1.5 w-1.5">
                {anyEnabled && (
                  <span className="anim-ping absolute inline-flex h-full w-full rounded-full bg-accent" />
                )}
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: anyEnabled ? "#2BD4C4" : "#6E7480" }} />
              </span>
              {anyEnabled ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
              {anyEnabled ? "ARMED" : "STANDBY"}
            </span>
          </div>
        </header>

        {/* Main content  -  3-column grid */}
        <div className="grid gap-6 p-6" style={{ gridTemplateColumns: "300px 1fr 300px" }}>

          {/* Left column  -  controls */}
          <div className="flex flex-col gap-4">
            <ScoreChart score={score} tier={tier} armed={anyEnabled} noiseCount={state.noiseGeneratedCount} trackerCount={state.trackersBlockedCount} />
            <StatCards state={state} />
            <AiDeepDiveCard
              risk={state.aiDeepDiveRisk}
              maxCamoActive={state.maxCamoActive}
              aiModeEnabled={aiDeepDiveConfig.aiModeEnabled}
              onToggleAiMode={handleToggleAiDeepDiveMode}
            />
            <ModuleToggles toggles={toggles} onToggle={handleToggle} />
            <FloatingPanelToggle />
            {toggles.honeypot && (
              <button
                type="button"
                onClick={handleHoneypotTest}
                className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-[11px] font-medium transition-colors hover:bg-white/[0.03]"
                style={{ borderColor: "#FF5C7A55", color: "#FF5C7A" }}
              >
                <Crosshair size={13} />
                Testuj Honeypot · wyślij wabik do trackera
              </button>
            )}
            {toggles.targetingShield && (
              <button
                type="button"
                onClick={handleTargetingTest}
                className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-[11px] font-medium transition-colors hover:bg-white/[0.03]"
                style={{ borderColor: "#3DD4A055", color: "#3DD4A0" }}
              >
                <Filter size={13} />
                Testuj Targeting Shield · blackout tej strony
              </button>
            )}
          </div>

          {/* Center  -  Radar */}
          <div className="flex flex-col items-center justify-start gap-4">
            <div className="text-center">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-low">
                Threat Radar
              </h2>
              <p className="text-[10px] text-fg-low/60 mt-0.5">
                {honeypotEvents.length === 0
                  ? "Czeka na realne zdarzenia  -  każda kropka to prawdziwy tracker"
                  : `${honeypotEvents.length} przechwyconych trackerów w tej sesji`}
              </p>
            </div>
            <CyberRadar
              armed={anyEnabled}
              honeypotEvents={honeypotEvents}
              noiseCount={state.noiseGeneratedCount}
              size={Math.min(500, typeof window !== "undefined" ? window.innerHeight - 200 : 500)}
            />
            <div className="flex gap-6 text-[10px] text-fg-low">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#E5484D" }} />
                Aktywny tracker (zbliża się)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#6E7480" }} />
                Zneutralizowany
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#9A8CFF" }} />
                Szum DataGhost
              </span>
            </div>
          </div>

          {/* Right column  -  logs + shadow audit + panic */}
          <div className="flex flex-col gap-4">
            <LoggerView entries={logs} />
            <ShadowAudit />
            <PanicButton onPanic={handlePanic} />
            <button
              type="button"
              onClick={handleExportData}
              title="Pobierz lokalnie wszystko, co rozszerzenie o Tobie wie — bez sekretów."
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-fg-mid ring-1 ring-inset ring-line-strong transition-colors hover:text-fg-hi hover:ring-line-hover">
              <Lock size={12} /> Eksportuj moje dane (JSON)
            </button>
            <div className="flex flex-col items-center gap-1.5">
              {state.activeAliasEmail ? (
                <p className="text-[10px] text-fg-low">
                  Alias:{" "}
                  <span className="font-mono text-fg-mid">{state.activeAliasEmail}</span>{" "}
                  <button
                    type="button"
                    onClick={handleGenerateAlias}
                    className="text-accent/80 transition-colors hover:text-accent"
                  >
                    nowy
                  </button>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerateAlias}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] px-2.5 py-1 text-[10px] text-fg-mid ring-1 ring-inset ring-line-strong transition-colors hover:text-fg-hi hover:ring-line-hover"
                >
                  <Mail size={11} /> Generuj alias e-mail
                </button>
              )}
              <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-fg-low/50">
                <Lock size={10} /> Privacy-by-Design · dane lokalne
              </p>
            </div>
          </div>
        </div>

        {/* Pełnoszerokościowy kreator wirtualnej tożsamości */}
        <div className="px-6 pb-8">
          <VirtualIdentityStudio
            value={identity}
            activeConfig={activeIdentity}
            onChange={handleIdentityChange}
            onApply={handleIdentityApply}
          />
        </div>
      </div>

      <div className="grain-layer" />
    </div>
  )
}
