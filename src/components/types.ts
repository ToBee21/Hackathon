// src/components/types.ts
// Typy UI należące do Modułu C (Privacy Dashboard).
// Współdzielony kontrakt domenowy (PrivacyState itp.) żyje w ../types
// i jest własnością całego zespołu — tutaj trzymamy wyłącznie typy interfejsu.

import type { PrivacyState } from "../types"

/** Identyfikatory funkcji, które użytkownik może włączać/wyłączać. */
export type ModuleId = "dataGhost" | "mouseJitter" | "keystroke"

/** Źródło wpisu w loggerze (moduł funkcjonalny lub sam rdzeń systemu). */
export type LogSource = ModuleId | "aiDeepDive" | "system"

/** Pojedyncze zdarzenie pokazywane w Real-time Loggerze. */
export interface LogEntry {
  id: string
  timestamp: number
  source: LogSource
  message: string
  count?: number
}

/** Stan przełączników poszczególnych funkcji ochronnych. */
export interface ModuleToggleState {
  dataGhost: boolean
  mouseJitter: boolean
  keystroke: boolean
}

/**
 * Kontrakt magistrali wiadomości (chrome.runtime), na którą reaguje Dashboard.
 *
 * Moduł A (background) i Moduł B (content) emitują LOG_EVENT / STATE_UPDATE.
 * Dashboard (Moduł C) emituje TOGGLE_MODULE oraz PANIC_BUTTON, które
 * obsługują odpowiednio Moduły A/B oraz D.
 */
export type RuntimeMessage =
  | { type: "LOG_EVENT"; entry: Omit<LogEntry, "id"> }
  | { type: "STATE_UPDATE"; state: Partial<PrivacyState> }
  | { type: "TOGGLE_MODULE"; module: ModuleId; enabled: boolean }
  | { type: "PANIC_BUTTON" }
  | { type: "REQUEST_STATE" }
