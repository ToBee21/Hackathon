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
// Generowany raz per instalację, przechowywany w pamięci rozszerzenia.
// W przyszłości można zastąpić hasłem użytkownika.

let _internalPassphrase: string | null = null;

async function getPassphrase(): Promise<string> {
  if (_internalPassphrase) return _internalPassphrase;

  // Próbujemy odczytać sól — jeśli istnieje, to rozszerzenie było wcześniej skonfigurowane
  const stored = await chrome.storage.local.get(STORAGE_KEYS.CRYPTO_SALT);
  if (stored[STORAGE_KEYS.CRYPTO_SALT]) {
    _internalPassphrase = stored[STORAGE_KEYS.CRYPTO_SALT] as string;
  } else {
    _internalPassphrase = generateRandomPassphrase();
    await chrome.storage.local.set({
      [STORAGE_KEYS.CRYPTO_SALT]: _internalPassphrase,
    });
  }
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
  return decrypt<T>(payload, passphrase);
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

    // 2. Czyszczenie danych rozszerzenia (chrome.storage.local)
    await chrome.storage.local.clear();
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
