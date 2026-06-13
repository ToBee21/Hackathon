// src/popup.tsx
// Moduł C — Privacy Dashboard. Punkt wejścia interfejsu (Plasmo popup).
// Orkiestruje stan, nasłuchuje magistrali wiadomości chrome.runtime
// i renderuje komponenty wizualne. Cała integracja z innymi modułami
// odbywa się luźno przez wiadomości — bez twardych importów ich kodu.
//
// Warstwa wizualna: "Stealth Intelligence Console" — chłodny near-black,
// jeden racjonowany teal-akcent, forensic detail. Logika (score, collapse
// logów, hydration, storage, panic) pozostaje nietknięta.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties
} from "react"

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

/** Bezpieczny uchwyt do API rozszerzenia (działa też poza kontekstem extension). */
const ext: typeof chrome | undefined = (globalThis as any).chrome

/**
 * Dynamiczny algorytm Privacy Score (0–100).
 * Baza: aktywne moduły (max 50). Bonus: realna aktywność A/B (max 50).
 */
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

/** Mapuje wynik + stan uzbrojenia na poziom ochrony pokazywany w hero. */
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

export default function Popup() {
  const [toggles, setToggles] = useState<ModuleToggleState>(DEFAULT_TOGGLES)
  const [state, setState] = useState<PrivacyState>(DEFAULT_STATE)
  const [logs, setLogs] = useState<LogEntry[]>([])
  // Becomes true once the stored state is loaded. Guards the write-back effect
  // so we never persist DEFAULT_STATE over DataGhost's accumulated counters
  // before hydration finishes.
  const [hydrated, setHydrated] = useState(false)

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

  // --- Inicjalizacja: wczytanie zapisanego stanu + nasłuch wiadomości ---
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
      }
    }

    ext.runtime.onMessage.addListener(handler)
    // Poproś moduły A/B o aktualny stan przy otwarciu popupu.
    ext.runtime.sendMessage({ type: "REQUEST_STATE" } as RuntimeMessage)

    return () => ext.runtime.onMessage.removeListener(handler)
  }, [addLog])

  // Privacy Score liczony na żywo i utrzymywany w stanie współdzielonym.
  const score = useMemo(
    () => computePrivacyScore(toggles, state),
    [toggles, state]
  )

  useEffect(() => {
    if (!hydrated || !ext?.storage?.local) return
    ext.storage.local.set({ [STORAGE_KEY_STATE]: { ...state, privacyScore: score } })
  }, [hydrated, score, state])

  // --- Akcje użytkownika ---
  const handleToggle = useCallback(
    (module: ModuleId, enabled: boolean) => {
      setToggles((prev) => {
        const next = { ...prev, [module]: enabled }
        ext?.storage?.local?.set({ [STORAGE_KEY_TOGGLES]: next })
        return next
      })

      // Powiadom moduły A/B, by włączyły/wyłączyły swoje działanie.
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

  // Demo: ręcznie wystrzel wabik do trackera, by jury zobaczyło pełny przepływ
  // przechwycenie → zatrucie → log. Realny log "TRAP" przyjdzie z backgroundu.
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
    // Logika głębokiego czyszczenia należy do Modułu D — wywołujemy ją
    // przez magistralę wiadomości, by nie wiązać się z jego implementacją.
    ext?.runtime?.sendMessage({ type: "PANIC_BUTTON" } as RuntimeMessage)

    setLogs([])
    setState(DEFAULT_STATE)
    addLog({
      timestamp: Date.now(),
      source: "system",
      message: "PANIC: wyczyszczono sesje śledzące i dane lokalne"
    })
  }, [addLog])

  const anyEnabled =
    toggles.dataGhost ||
    toggles.mouseJitter ||
    toggles.keystroke ||
    toggles.honeypot
  const tier = deriveTier(anyEnabled, score)

  // Ambient orb tint follows the armed/standby system state. The `unknown`
  // hop lets us set CSS custom properties regardless of @types/react version.
  const rootStyle = {
    "--orb": anyEnabled ? "rgba(43,212,196,0.24)" : "rgba(110,116,128,0.16)"
  } as unknown as CSSProperties

  // Per-child entrance index for the staggered mount choreography.
  const v = (i: number) => ({ "--i": i }) as unknown as CSSProperties

  return (
    <div
      className="console relative w-[360px] font-sans text-fg-hi"
      style={rootStyle}>
      <div className="console-grid" />

      <div className="stagger relative z-[1] flex flex-col gap-3 p-4">
        {/* Nagłówek — tożsamość + stan systemu */}
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
        </header>

        {/* Privacy Score — hero */}
        <div style={v(1)} className="pt-1">
          <ScoreChart
            score={score}
            tier={tier}
            armed={anyEnabled}
            noiseCount={state.noiseGeneratedCount}
            trackerCount={state.trackersBlockedCount}
          />
        </div>

        {/* Statystyki */}
        <div style={v(2)}>
          <StatCards state={state} />
        </div>

        {/* Przełączniki modułów */}
        <div style={v(3)} className="flex flex-col gap-2">
          <ModuleToggles toggles={toggles} onToggle={handleToggle} />

          {/* Demo: ręczny wabik dla Honeypota — widoczny tylko gdy moduł zbrojny */}
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

        {/* Telemetria na żywo */}
        <div style={v(4)}>
          <LoggerView entries={logs} />
        </div>

        {/* Panic — hold-to-wipe */}
        <div style={v(5)}>
          <PanicButton onPanic={handlePanic} />
        </div>

        {/* Stopka — sygnał zaufania */}
        <div style={v(6)} className="flex flex-col items-center gap-1 pt-0.5">
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
      </div>

      <div className="grain-layer" />
    </div>
  )
}
