// src/shared/storageKeys.ts
// Central registry of chrome.storage.local keys. Existing modules use the raw
// "cnd:*" string literals directly; new floating/side-panel surfaces import from
// here so the key set has one documented home.

export const STORAGE_KEYS = {
  /** Shared dashboard state (Privacy Score, counters, aiDeepDiveRisk). */
  state: "cnd:state",
  /** Module on/off toggles. */
  toggles: "cnd:toggles",
  /** AI Deep-Dive runtime config (aiModeEnabled, selectedModelId, ...). */
  aiDeepDiveConfig: "cnd:ai-deep-dive:config",
  /** Per-origin floating-window UI state (collapsed, position, disabled). */
  floating: "cnd:floating",
  /** Last computed page analysis per tab, for the side panel to read. */
  lastAnalysis: "cnd:last-analysis"
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
