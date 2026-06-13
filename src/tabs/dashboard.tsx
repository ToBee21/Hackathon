// src/tabs/dashboard.tsx
// Pełnoekranowy Dashboard — otwierany przyciskiem w popup.
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
import { Crosshair, Lock, Logo, Mail, ShieldCheck, ShieldOff } from "../components/icons"
import LoggerView from "../components/LoggerView"
import ModuleToggles from "../components/ModuleToggles"
import PanicButton from "../components/PanicButton"
import ScoreChart, { type ProtectionTier } from "../components/ScoreChart"
import ShadowAudit from "../components/ShadowAudit"
import StatCards from "../components/StatCards"
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
import type { PrivacyState } from "../types"

import "../style.css"

const STORAGE_KEY_TOGGLES = "cnd:toggles"
const STORAGE_KEY_STATE = "cnd:state"
const MAX_LOG_ENTRIES = 50
const LOG_COLLAPSE_WINDOW_MS = 8000

const DEFAULT_TOGGLES: ModuleToggleState = {
  dataGhost: true,
  mouseJitter: true,
  keystroke: true,
  honeypot: true,
}

const DEFAULT_STATE: PrivacyState = {
  privacyScore: 0,
  trackersBlockedCount: 0,
  noiseGeneratedCount: 0,
  activeAliasEmail: null,
  aiDeepDiveRisk: null,
  aiDeepDiveDetectionCount: 0,
  maxCamoActive: false,
}

const ext: typeof chrome | undefined = (globalThis as any).chrome

function computePrivacyScore(toggles: ModuleToggleState, state: PrivacyState): number {
  let score = 0
  if (toggles.dataGhost) score += 15
  if (toggles.honeypot) score += 15
  if (toggles.mouseJitter) score += 10
  if (toggles.keystroke) score += 10
  const activity = state.noiseGeneratedCount * 2 + state.trackersBlockedCount * 3
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
    ext.storage.local.get([STORAGE_KEY_TOGGLES, STORAGE_KEY_STATE, STORAGE_KEY_AI_DEEP_DIVE_CONFIG], (result) => {
      if (result?.[STORAGE_KEY_TOGGLES]) setToggles({ ...DEFAULT_TOGGLES, ...result[STORAGE_KEY_TOGGLES] })
      if (result?.[STORAGE_KEY_STATE]) setState({ ...DEFAULT_STATE, ...result[STORAGE_KEY_STATE] })
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
    ext.storage.local.set({ [STORAGE_KEY_STATE]: { ...state, privacyScore: score } })
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
      addLog({ timestamp: Date.now(), source: "system", message: `Wygenerowano alias e-mail: ${alias.alias}` })
    } catch {
      addLog({ timestamp: Date.now(), source: "system", message: "Nie udało się wygenerować aliasu e-mail" })
    }
  }, [addLog])

  const handleHoneypotTest = useCallback(() => {
    ext?.runtime?.sendMessage({ type: "TRIGGER_HONEYPOT_TEST" } as RuntimeMessage)
    addLog({ timestamp: Date.now(), source: "honeypot", message: "Wysłano wabik do Google Analytics — czekam na zatrucie…" })
  }, [addLog])

  const handlePanic = useCallback(() => {
    ext?.runtime?.sendMessage({ type: "PANIC_BUTTON" } as RuntimeMessage)
    setLogs([])
    setState(DEFAULT_STATE)
    setHoneypotEvents([])
    addLog({ timestamp: Date.now(), source: "system", message: "PANIC: wyczyszczono sesje śledzące i dane lokalne" })
  }, [addLog])

  const anyEnabled = toggles.dataGhost || toggles.mouseJitter || toggles.keystroke || toggles.honeypot
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
                Cloak <span className="text-fg-low">&amp;</span> Dagger
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

        {/* Main content — 3-column grid */}
        <div className="grid gap-6 p-6" style={{ gridTemplateColumns: "300px 1fr 300px" }}>

          {/* Left column — controls */}
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
          </div>

          {/* Center — Radar */}
          <div className="flex flex-col items-center justify-start gap-4">
            <div className="text-center">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-low">
                Threat Radar
              </h2>
              <p className="text-[10px] text-fg-low/60 mt-0.5">
                {honeypotEvents.length === 0
                  ? "Czeka na realne zdarzenia — każda kropka to prawdziwy tracker"
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

          {/* Right column — logs + shadow audit + panic */}
          <div className="flex flex-col gap-4">
            <LoggerView entries={logs} />
            <ShadowAudit />
            <PanicButton onPanic={handlePanic} />
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
      </div>

      <div className="grain-layer" />
    </div>
  )
}
