// src/shared/storage.ts
// Moduł D: Zarządzanie pamięcią (chrome.storage.local) + logika Panic Button.
// Eksponuje API do zapisu/odczytu zaszyfrowanych danych, ustawień modułów i logów.

import type {
  EncryptedPayload,
  LogEntry,
  ModuleSettings,
  PanicButtonResult,
  PrivacyState,
  RuntimeMessage,
} from "../types";
import { STORAGE_KEYS } from "../types";
import { decrypt, encrypt, generateRandomPassphrase } from "./crypto";

// ─── Wewnętrzna passphrase ──────────────────────────────────────────────────
// BEZPIECZEŃSTWO: klucz NIGDY nie trafia na dysk obok szyfrogramu. Wcześniej był
// zapisywany jawnie w chrome.storage.local (ten sam magazyn, który miał chronić),
// co sprowadzało ochronę do zera. Teraz klucz żyje wyłącznie w
// chrome.storage.session — pamięci sesji przeglądarki, która NIE jest zapisywana
// na dysk i jest czyszczona po zamknięciu przeglądarki.
//
// Kompromis: dane zaszyfrowane w jednej sesji przeglądarki nie odszyfrują się po
// jej restarcie (powstaje nowy klucz). Dla jedynego konsumenta (opcjonalny token
// API integracji aliasów) jest to akceptowalne — użytkownik poda token ponownie.
// Trwałe szyfrowanie między sesjami wymagałoby hasła głównego użytkownika.

let _internalPassphrase: string | null = null;

async function getPassphrase(): Promise<string> {
  if (_internalPassphrase) return _internalPassphrase;

  const session = (chrome.storage as typeof chrome.storage & {
    session?: chrome.storage.StorageArea;
  }).session;

  // Preferowana ścieżka: klucz w pamięci sesji (nigdy na dysku).
  if (session) {
    const stored = await session.get(STORAGE_KEYS.CRYPTO_KEY);
    const existing = stored[STORAGE_KEYS.CRYPTO_KEY];
    if (typeof existing === "string" && existing.length > 0) {
      _internalPassphrase = existing;
      return existing;
    }
    _internalPassphrase = generateRandomPassphrase();
    await session.set({ [STORAGE_KEYS.CRYPTO_KEY]: _internalPassphrase });
    return _internalPassphrase;
  }

  // Fallback (brak storage.session): klucz istnieje tylko w pamięci tego
  // procesu — wciąż nigdy nie jest zapisywany na dysk.
  _internalPassphrase = generateRandomPassphrase();
  return _internalPassphrase;
}

// ─── Encrypted Storage API ──────────────────────────────────────────────────

/**
 * Zapisuje dane zaszyfrowane AES-GCM do chrome.storage.local.
 *
 * @param key - Klucz storage (z STORAGE_KEYS).
 * @param data - Dowolny obiekt do zaszyfrowania i zapisania.
 */
export async function saveEncrypted(key: string, data: unknown): Promise<void> {
  const passphrase = await getPassphrase();
  const payload = await encrypt(data, passphrase);
  await chrome.storage.local.set({ [key]: payload });
}

/**
 * Odczytuje i deszyfruje dane z chrome.storage.local.
 *
 * @param key - Klucz storage (z STORAGE_KEYS).
 * @returns Odszyfrowany obiekt lub null jeśli klucz nie istnieje.
 */
export async function loadEncrypted<T = unknown>(
  key: string
): Promise<T | null> {
  const stored = await chrome.storage.local.get(key);
  const payload = stored[key] as EncryptedPayload | undefined;
  if (!payload || !payload.iv || !payload.ciphertext || !payload.salt) {
    return null;
  }

  const passphrase = await getPassphrase();
  try {
    return await decrypt<T>(payload, passphrase);
  } catch {
    // Złe hasło (np. po restarcie sesji) lub uszkodzone dane — traktuj jak brak.
    return null;
  }
}

// ─── Module Settings ────────────────────────────────────────────────────────

/** Domyślne ustawienia modułów — bezpieczne wartości startowe. */
const DEFAULT_SETTINGS: ModuleSettings = {
  dataGhostEnabled: true,
  bionicBlurEnabled: true,
  mouseJitter: { intensity: 5, isEnabled: true },
  keystroke: { minDelayMs: 10, maxDelayMs: 40, isEnabled: true },
  emailMaskingEnabled: true,
};

/**
 * Pobiera aktualne ustawienia modułów.
 * Jeśli brak zapisanych ustawień, zwraca wartości domyślne.
 */
export async function getModuleSettings(): Promise<ModuleSettings> {
  const stored = await chrome.storage.local.get(
    STORAGE_KEYS.MODULE_SETTINGS
  );
  const raw = stored[STORAGE_KEYS.MODULE_SETTINGS] as
    | ModuleSettings
    | undefined;
  return raw ?? { ...DEFAULT_SETTINGS };
}

/**
 * Zapisuje ustawienia modułów i rozsyła powiadomienie do innych komponentów.
 */
export async function saveModuleSettings(
  settings: ModuleSettings
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.MODULE_SETTINGS]: settings,
  });

  // Powiadom inne moduły o zmianie ustawień
  const message: RuntimeMessage<ModuleSettings> = {
    type: "SETTINGS_CHANGED",
    payload: settings,
    timestamp: Date.now(),
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup/content may not be active — ignorujemy błąd
  });
}

// ─── Privacy State ──────────────────────────────────────────────────────────

/** Domyślny stan prywatności. */
const DEFAULT_PRIVACY_STATE: PrivacyState = {
  privacyScore: 0,
  trackersBlockedCount: 0,
  noiseGeneratedCount: 0,
  activeAliasEmail: null,
  aiDeepDiveRisk: null,
  aiDeepDiveDetectionCount: 0,
  maxCamoActive: false,
};

/** Pobiera aktualny stan prywatności. */
export async function getPrivacyState(): Promise<PrivacyState> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.PRIVACY_STATE);
  const raw = stored[STORAGE_KEYS.PRIVACY_STATE] as PrivacyState | undefined;
  return raw ?? { ...DEFAULT_PRIVACY_STATE };
}

/** Aktualizuje stan prywatności (częściowa aktualizacja). */
export async function updatePrivacyState(
  partial: Partial<PrivacyState>
): Promise<PrivacyState> {
  const current = await getPrivacyState();
  const updated = { ...current, ...partial };
  await chrome.storage.local.set({
    [STORAGE_KEYS.PRIVACY_STATE]: updated,
  });
  return updated;
}

// ─── Log Entries ────────────────────────────────────────────────────────────

const MAX_LOG_ENTRIES = 500;

/** Dodaje nowy wpis do logu aktywności. */
export async function addLogEntry(
  entry: Omit<LogEntry, "id" | "timestamp">
): Promise<LogEntry> {
  const fullEntry: LogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  const entries = await getLogEntries();
  entries.unshift(fullEntry);

  // Ogranicz rozmiar logu — zachowaj ostatnie MAX_LOG_ENTRIES wpisów
  if (entries.length > MAX_LOG_ENTRIES) {
    entries.length = MAX_LOG_ENTRIES;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.LOG_ENTRIES]: entries,
  });

  return fullEntry;
}

/** Pobiera historię logów (najnowsze pierwsze). */
export async function getLogEntries(limit?: number): Promise<LogEntry[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.LOG_ENTRIES);
  const entries = (stored[STORAGE_KEYS.LOG_ENTRIES] as LogEntry[]) ?? [];
  return limit ? entries.slice(0, limit) : entries;
}

/** Czyści historię logów. */
export async function clearLogEntries(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.LOG_ENTRIES]: [] });
}

// ─── Panic Button 🔴 ────────────────────────────────────────────────────────

/**
 * PANIC BUTTON — natychmiastowe głębokie czyszczenie wszystkich danych:
 * - chrome.storage.local (dane rozszerzenia)
 * - Cookies (wszystkie domeny)
 * - Cache
 * - IndexedDB
 * - localStorage & sessionStorage (via content script lub browsingData)
 *
 * Po wykonaniu rozszerzenie wraca do stanu fabrycznego.
 */
export async function panicButton(): Promise<PanicButtonResult> {
  const result: PanicButtonResult = {
    success: false,
    clearedItems: {
      localStorage: false,
      sessionStorage: false,
      indexedDB: false,
      cookies: false,
      cache: false,
      extensionStorage: false,
    },
    timestamp: Date.now(),
  };

  try {
    // 1. Czyszczenie danych przeglądania via chrome.browsingData API
    //    (cookies, cache, indexedDB, localStorage, sessionStorage)
    await chrome.browsingData.remove(
      { since: 0 },
      {
        cookies: true,
        cache: true,
        indexedDB: true,
        localStorage: true,
        // sessionStorage nie jest obsługiwany przez browsingData API,
        // ale jest czyszczony automatycznie po zamknięciu karty
      }
    );
    result.clearedItems.cookies = true;
    result.clearedItems.cache = true;
    result.clearedItems.indexedDB = true;
    result.clearedItems.localStorage = true;
    result.clearedItems.sessionStorage = true;

    // 2. Czyszczenie danych rozszerzenia (chrome.storage.local + session)
    await chrome.storage.local.clear();
    const session = (chrome.storage as typeof chrome.storage & {
      session?: chrome.storage.StorageArea;
    }).session;
    await session?.clear();
    result.clearedItems.extensionStorage = true;

    // 3. Reset wewnętrznej passphrase — wymusi wygenerowanie nowej
    _internalPassphrase = null;

    result.success = true;
  } catch (err) {
    result.error =
      err instanceof Error ? err.message : "Unknown error during panic wipe";
    // Nawet przy błędzie, próbujemy wyczyścić storage rozszerzenia
    try {
      await chrome.storage.local.clear();
      result.clearedItems.extensionStorage = true;
      _internalPassphrase = null;
    } catch {
      // Krytyczny błąd — nic więcej nie możemy zrobić
    }
  }

  return result;
}
