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

// --- Module B+: Bionic Blur contracts ---

export interface BionicBlurConfig {
  isEnabled: boolean;
  mouseEnabled: boolean;
  keyboardEnabled: boolean;
  fingerprintEnabled: boolean;
  browserGuardEnabled: boolean;
  mouseIntensity: number;
  timestampJitterMs: number;
  excludedHosts: string[];
  debugMode: boolean;
}

export interface PrivacyProfile {
  seed: string;
  origin: string;
  locale: string;
  timezone: string;
  timezoneOffsetMinutes: number;
  platform: string;
  screen: {
    width: number;
    height: number;
    colorDepth: number;
  };
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
  webglVendor: string;
  webglRenderer: string;
}

export interface PointerLikeFields {
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  screenX: number;
  screenY: number;
  movementX: number;
  movementY: number;
}

export type FingerprintSurface =
  | "event-listener"
  | "mouse"
  | "keyboard"
  | "canvas"
  | "webgl"
  | "audio"
  | "fonts"
  | "navigator"
  | "timezone"
  | "screen"
  | "permissions"
  | "media-devices"
  | "battery"
  | "sensors"
  | "network-info"
  | "timing"
  | "browser-guard";

export interface BionicBlurTelemetryMessage {
  type: "BIONIC_BLUR_TELEMETRY";
  payload: {
    surface: FingerprintSurface;
    action: "patched" | "blurred" | "blocked" | "configured" | "proof";
    count: number;
    timestamp: number;
    metrics?: Record<string, number | string | boolean>;
  };
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

export interface ToggleModuleMessage {
  type: "TOGGLE_MODULE";
  module: "dataGhost" | "mouseJitter" | "keystroke" | "honeypot";
  enabled: boolean;
}

/** Demo: ręczne wyzwolenie ataku Honeypota (np. przycisk w UI dla jury). */
export interface TriggerHoneypotTestMessage {
  type: "TRIGGER_HONEYPOT_TEST";
}

export interface RequestStateMessage {
  type: "REQUEST_STATE";
}

export interface InjectBionicMainMessage {
  type: "INJECT_BIONIC_MAIN";
}

export interface GenerateAliasMessage {
  type: "GENERATE_ALIAS";
}

export type GenerateAliasResponse =
  | { success: true; alias: EmailAlias }
  | { success: false; error: string };

export type BackgroundInboundMessage =
  | TriggerNoiseMessage
  | GetStatusMessage
  | SetNoiseEnabledMessage
  | ToggleModuleMessage
  | RequestStateMessage
  | InjectBionicMainMessage
  | GenerateAliasMessage
  | TriggerHoneypotTestMessage
  | BionicBlurTelemetryMessage;

export type BackgroundOutboundMessage = NoiseInjectedMessage | HoneypotLog;

export interface DataGhostStatus {
  noiseGeneratedCount: number;
  isNoiseEnabled: boolean;
}

// --- Module D: Secure Core & Identity Masking ---

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

// --- Module D+: Honeypot Trap (Data Poisoning / Zatruwanie Profilera) ---

/**
 * Log pojedynczego udanego przechwycenia i zatrucia żądania trackera.
 * Wysyłany do dashboardu (Moduł C) po każdym ataku — "mocne logi dla jury".
 */
export interface HoneypotLog {
  type: "HONEYPOT_ATTACK";
  payload: {
    /** Czytelna nazwa trackera, np. "Facebook Pixel". */
    trackerName: string;
    /** Oryginalny URL żądania trackera (przed zatruciem). */
    targetUrl: string;
    /** Ludzki opis wstrzykniętego profilu — co podaliśmy profilerowi. */
    poisonedData: string;
    timestamp: number;
  };
}

/** Sygnatura znanego trackera używana do budowy reguł DNR. */
export interface TrackerSignature {
  /** Czytelna nazwa, np. "Google Analytics". */
  name: string;
  /** Wzorzec DNR (urlFilter) dopasowujący żądania trackera. */
  urlFilter: string;
  /**
   * Nazwy realnych parametrów profilujących trackera (np. "cid", "_fbp"),
   * które nadpisujemy trucizną zamiast jedynie dokładać śmieci obok.
   */
  identityParams: string[];
}

/** Wygenerowany ładunek dezinformacyjny ("Poison Payload"). */
export interface HoneypotPoison {
  /** Parametry query wstrzykiwane/nadpisywane w żądaniu (klucz → wartość). */
  params: Record<string, string>;
  /** Ludzki opis wstrzykniętego profilu (trafia do HoneypotLog.poisonedData). */
  description: string;
}

// --- Runtime message format shared by modules ---

export type RuntimeMessageType =
  | "NOISE_INJECTED"
  | "TRACKER_BLOCKED"
  | "MOUSE_JITTERED"
  | "KEYSTROKE_MASKED"
  | "BIONIC_BLUR_TELEMETRY"
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

// --- Storage Keys ---

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
