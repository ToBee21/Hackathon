// src/types.ts

export interface PrivacyState {
  privacyScore: number;
  trackersBlockedCount: number;
  noiseGeneratedCount: number;
  activeAliasEmail: string | null;
}

export interface MouseJitterConfig {
  intensity: number;
  isEnabled: boolean;
}

export interface KeystrokeConfig {
  minDelayMs: number;
  maxDelayMs: number;
  isEnabled: boolean;
}

// --- Module A: DataGhost message types ---

export interface NoiseInjectedMessage {
  type: "NOISE_INJECTED";
  payload: {
    keyword: string;
    category: string;
    timestamp: number;
  };
}

export interface TriggerNoiseMessage {
  type: "TRIGGER_NOISE";
}

export interface GetStatusMessage {
  type: "GET_STATUS";
}

export interface SetNoiseEnabledMessage {
  type: "SET_NOISE_ENABLED";
  payload: { enabled: boolean };
}

export type BackgroundInboundMessage =
  | TriggerNoiseMessage
  | GetStatusMessage
  | SetNoiseEnabledMessage;

export type BackgroundOutboundMessage = NoiseInjectedMessage;

export interface DataGhostStatus {
  noiseGeneratedCount: number;
  isNoiseEnabled: boolean;
}

// ─── Moduł D: Secure Core & Identity Masking ────────────────────────────────

/** Struktura zaszyfrowanych danych przechowywanych w storage. */
export interface EncryptedPayload {
  /** Wektor inicjalizacji (base64) */
  iv: string;
  /** Zaszyfrowany tekst (base64) */
  ciphertext: string;
  /** Sól kryptograficzna (base64) */
  salt: string;
}

/** Wynik operacji Panic Button — głębokiego czyszczenia danych. */
export interface PanicButtonResult {
  success: boolean;
  clearedItems: {
    localStorage: boolean;
    sessionStorage: boolean;
    indexedDB: boolean;
    cookies: boolean;
    cache: boolean;
    extensionStorage: boolean;
  };
  timestamp: number;
  error?: string;
}

/** Alias e-mail wygenerowany przez moduł Identity Masking. */
export interface EmailAlias {
  id: string;
  alias: string;
  forwardTo?: string;
  createdAt: number;
  isActive: boolean;
  source: "simplelogin" | "relay" | "offline";
}

/** Wpis logu aktywności — wyświetlany w Real-time Logger (Moduł C). */
export interface LogEntry {
  id: string;
  timestamp: number;
  module: "dataghost" | "bionicblur" | "dashboard" | "core";
  action: string;
  details?: string;
}

/** Globalne ustawienia włączenia/wyłączenia poszczególnych modułów. */
export interface ModuleSettings {
  dataGhostEnabled: boolean;
  bionicBlurEnabled: boolean;
  mouseJitter: MouseJitterConfig;
  keystroke: KeystrokeConfig;
  emailMaskingEnabled: boolean;
}

/** Stan prywatności — agregowany i wyświetlany w dashboardzie. */
export interface PrivacyState {
  privacyScore: number;
  trackersBlockedCount: number;
  noiseGeneratedCount: number;
  activeAliasEmail: string | null;
}

// ─── Komunikacja między modułami (chrome.runtime messages) ──────────────────

export type RuntimeMessageType =
  | "NOISE_INJECTED"
  | "TRACKER_BLOCKED"
  | "MOUSE_JITTERED"
  | "KEYSTROKE_MASKED"
  | "PANIC_BUTTON"
  | "PANIC_RESULT"
  | "ALIAS_GENERATED"
  | "LOG_ENTRY"
  | "GET_STATE"
  | "STATE_UPDATE"
  | "SETTINGS_CHANGED";

/** Wspólny format wiadomości przesyłanych przez chrome.runtime.sendMessage. */
export interface RuntimeMessage<T = unknown> {
  type: RuntimeMessageType;
  payload: T;
  timestamp: number;
}

// ─── Storage Keys ───────────────────────────────────────────────────────────

/** Klucze używane w chrome.storage.local — centralna definicja zapobiega kolizjom. */
export const STORAGE_KEYS = {
  MODULE_SETTINGS: "cloak_module_settings",
  PRIVACY_STATE: "cloak_privacy_state",
  LOG_ENTRIES: "cloak_log_entries",
  EMAIL_ALIASES: "cloak_email_aliases",
  API_TOKENS: "cloak_api_tokens_encrypted",
  CRYPTO_SALT: "cloak_crypto_salt",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];