// src/popup.tsx
// Moduł C — Privacy Dashboard. Punkt wejścia interfejsu (Plasmo popup).

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties
} from "react"

import CyberRadar, { type HoneypotEvent } from "./components/CyberRadar"
import { Crosshair, Logo, Lock, ShieldCheck, ShieldOff } from "./components/icons"
import LoggerView from "./components/LoggerView"
import ModuleToggles from "./components/ModuleToggles"
import PanicButton from "./components/PanicButton"
import ScoreChart, { type ProtectionTier } from "./components/ScoreChart"
import StatCards from "./components/StatCards"
import type {
  LogEntry,
  ModuleId,
  ModuleToggleState,
  RuntimeMessage
} from "./components/types"
import type { PrivacyState } from "./types"

import "./style.css"

const STORAGE_KEY_TOGGLES = "cnd:toggles"
const STORAGE_KEY_STATE = "cnd:state"
const MAX_LOG_ENTRIES = 30
const LOG_COLLAPSE_WINDOW_MS = 8000

const DEFAULT_TOGGLES: ModuleToggleState = {
  dataGhost: true,
  mouseJitter: true,
  keystroke: true,
  honeypot: true
}

const DEFAULT_STATE: PrivacyState = {
  privacyScore: 0,
  trackersBlockedCount: 0,
  noiseGeneratedCount: 0,
  activeAliasEmail: null
}

const ext: typeof chrome | undefined = (globalThis as any).chrome

function computePrivacyScore(
  toggles: ModuleToggleState,
  state: PrivacyState
): number {
  let score = 0
  if (toggles.dataGhost) score += 15
  if (toggles.honeypot) score += 15
  if (toggles.mouseJitter) score += 10
  if (toggles.keystroke) score += 10

  const activity =
    state.noiseGeneratedCount * 2 + state.trackersBlockedCount * 3
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
  logCounter += 1
  return `${Date.now()}-${logCounter}`
}

// ─── Tab navigation ──────────────────────────────────────────────────────────

type Tab = "status" | "radar"

const TAB_LABELS: Record<Tab, string> = {
  status: "Status",
  radar: "Radar",
}

export default function Popup() {
  const [toggles, setToggles] = useState<ModuleToggleState>(DEFAULT_TOGGLES)
  const [state, setState] = useState<PrivacyState>(DEFAULT_STATE)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>("status")
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
          {
            ...latest,
            timestamp: entry.timestamp,
            count: (latest.count ?? 1) + (entry.count ?? 1)
          },
          ...prev.slice(1)
        ]
      }

      return [
        { ...entry, id: makeLogId(), count: entry.count ?? 1 },
        ...prev
      ].slice(0, MAX_LOG_ENTRIES)
    })
  }, [])

  useEffect(() => {
    if (!ext?.storage?.local) {
      setHydrated(true)
      return
    }

    ext.storage.local.get(
      [STORAGE_KEY_TOGGLES, STORAGE_KEY_STATE],
      (result) => {
        if (result?.[STORAGE_KEY_TOGGLES]) {
          setToggles({ ...DEFAULT_TOGGLES, ...result[STORAGE_KEY_TOGGLES] })
        }
        if (result?.[STORAGE_KEY_STATE]) {
          setState({ ...DEFAULT_STATE, ...result[STORAGE_KEY_STATE] })
        }
        setHydrated(true)
      }
    )
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
          break
        case "HONEYPOT_ATTACK":
          setState((prev) => ({
            ...prev,
            trackersBlockedCount: prev.trackersBlockedCount + 1,
          }))
          setHoneypotEvents((prev) => [
            ...prev.slice(-50),
            {
              id: Date.now(),
              trackerName: message.payload.trackerName,
              timestamp: message.payload.timestamp,
            },
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

  const score = useMemo(
    () => computePrivacyScore(toggles, state),
    [toggles, state]
  )

  useEffect(() => {
    if (!hydrated || !ext?.storage?.local) return
    ext.storage.local.set({ [STORAGE_KEY_STATE]: { ...state, privacyScore: score } })
  }, [hydrated, score, state])

  const handleToggle = useCallback(
    (module: ModuleId, enabled: boolean) => {
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

      addLog({
        timestamp: Date.now(),
        source: "system",
        message: `${enabled ? "Włączono" : "Wyłączono"} moduł: ${module}`
      })
    },
    [addLog]
  )

  const handleHoneypotTest = useCallback(() => {
    ext?.runtime?.sendMessage({
      type: "TRIGGER_HONEYPOT_TEST"
    } as RuntimeMessage)

    addLog({
      timestamp: Date.now(),
      source: "honeypot",
      message: "Wysłano wabik do Google Analytics — czekam na zatrucie…"
    })
  }, [addLog])

  const handlePanic = useCallback(() => {
    ext?.runtime?.sendMessage({ type: "PANIC_BUTTON" } as RuntimeMessage)

    setLogs([])
    setState(DEFAULT_STATE)
    setHoneypotEvents([])
    addLog({
      timestamp: Date.now(),
      source: "system",
      message: "PANIC: wyczyszczono sesje śledzące i dane lokalne"
    })
  }, [addLog])

  const handleOpenFullscreen = useCallback(() => {
    const url = ext?.runtime?.getURL("tabs/dashboard.html")
    if (url) ext?.tabs?.create({ url })
  }, [])

  const anyEnabled =
    toggles.dataGhost ||
    toggles.mouseJitter ||
    toggles.keystroke ||
    toggles.honeypot
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
        {/* Header */}
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
            {/* Full-screen button */}
            <button
              type="button"
              onClick={handleOpenFullscreen}
              title="Otwórz dashboard na pełnym ekranie"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-fg-low transition-colors hover:text-fg-hi"
              style={{ border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1 4.5V1.5H4M9 1.5H12V4.5M12 8.5V11.5H9M4 11.5H1V8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
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
          className="flex overflow-hidden rounded-lg"
        >
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors duration-150"
              style={{
                background: activeTab === tab ? "rgba(43,212,196,0.08)" : "transparent",
                color: activeTab === tab ? "#2BD4C4" : "#6E7480",
                borderBottom: activeTab === tab ? "2px solid #2BD4C4" : "2px solid transparent",
              }}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* ── STATUS TAB ── */}
        {activeTab === "status" && (
          <>
            <div style={v(2)} className="pt-1">
              <ScoreChart
                score={score}
                tier={tier}
                armed={anyEnabled}
                noiseCount={state.noiseGeneratedCount}
                trackerCount={state.trackersBlockedCount}
              />
            </div>

            <div style={v(3)}>
              <StatCards state={state} />
            </div>

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
            </div>

            <div style={v(5)}>
              <LoggerView entries={logs} />
            </div>

            <div style={v(6)}>
              <PanicButton onPanic={handlePanic} />
            </div>

            <div style={v(7)} className="flex flex-col items-center gap-1 pt-0.5">
              {state.activeAliasEmail && (
                <p className="text-[10px] text-fg-low">
                  Alias:{" "}
                  <span className="font-mono text-fg-mid">{state.activeAliasEmail}</span>
                </p>
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
              <p className="text-center text-[10px] text-fg-low pt-1" style={{ maxWidth: 220 }}>
                Radar czeka na rzeczywiste zdarzenia. Wejdź na stronę z trackerami
                lub użyj przycisku "Testuj Honeypot" w zakładce Status.
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
                <span style={{ color: "#E5484D" }}>●</span> {state.trackersBlockedCount} zatrutych trackerów
              </span>
              <span>
                <span style={{ color: "#9A8CFF" }}>●</span> {state.noiseGeneratedCount} wstrzyknięć szumu
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grain-layer" />
    </div>
  )
}
