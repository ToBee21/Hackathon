// src/popup.tsx
// Moduł C — Privacy Dashboard. Punkt wejścia interfejsu (Plasmo popup).
// Orkiestruje stan, nasłuchuje magistrali wiadomości chrome.runtime
// i renderuje komponenty wizualne. Cała integracja z innymi modułami
// odbywa się luźno przez wiadomości — bez twardych importów ich kodu.

import { useCallback, useEffect, useMemo, useState } from "react"

import LoggerView from "./components/LoggerView"
import ModuleToggles from "./components/ModuleToggles"
import ScoreChart from "./components/ScoreChart"
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
const MAX_LOG_ENTRIES = 80

const DEFAULT_TOGGLES: ModuleToggleState = {
  dataGhost: true,
  mouseJitter: true,
  keystroke: true
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
  if (toggles.dataGhost) score += 20
  if (toggles.mouseJitter) score += 15
  if (toggles.keystroke) score += 15

  const activity =
    state.noiseGeneratedCount * 2 + state.trackersBlockedCount * 3
  score += Math.min(50, activity)

  return Math.max(0, Math.min(100, score))
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
    setLogs((prev) =>
      [{ ...entry, id: makeLogId() }, ...prev].slice(0, MAX_LOG_ENTRIES)
    )
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

  const anyEnabled = toggles.dataGhost || toggles.mouseJitter || toggles.keystroke

  return (
    <div className="flex w-[360px] flex-col gap-4 bg-slate-950 p-4 font-sans text-slate-100">
      {/* Nagłówek */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🗡️</span>
          <div className="leading-tight">
            <h1 className="text-sm font-bold tracking-tight">Cloak &amp; Dagger</h1>
            <p className="text-[10px] text-slate-500">Active Privacy Defense</p>
          </div>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
            anyEnabled
              ? "bg-emerald-400/10 text-emerald-400"
              : "bg-red-400/10 text-red-400"
          }`}>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              anyEnabled ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          {anyEnabled ? "ACTIVE" : "IDLE"}
        </span>
      </header>

      {/* Privacy Score */}
      <ScoreChart score={score} />

      {/* Statystyki */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
          <p className="text-lg font-bold tabular-nums text-violet-400">
            {state.noiseGeneratedCount}
          </p>
          <p className="text-[10px] text-slate-400">Wstrzyknięty szum</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
          <p className="text-lg font-bold tabular-nums text-cyan-400">
            {state.trackersBlockedCount}
          </p>
          <p className="text-[10px] text-slate-400">Zmylone trackery</p>
        </div>
      </div>

      {/* Przełączniki modułów */}
      <ModuleToggles toggles={toggles} onToggle={handleToggle} />

      {/* Real-time logger */}
      <LoggerView entries={logs} />

      {/* Panic Button */}
      <button
        type="button"
        onClick={handlePanic}
        className="group flex items-center justify-center gap-2 rounded-xl bg-red-500/90 py-2.5 text-sm font-bold tracking-wide text-white transition-all hover:bg-red-500 active:scale-[0.98]">
        <span className="transition-transform group-hover:rotate-12">🧨</span>
        PANIC BUTTON
      </button>

      {state.activeAliasEmail && (
        <p className="text-center text-[10px] text-slate-500">
          Alias e-mail: <span className="text-slate-300">{state.activeAliasEmail}</span>
        </p>
      )}
    </div>
  )
}
