// src/shared/crypto.ts
// Moduł D: Szyfrowanie i deszyfrowanie danych za pomocą Web Crypto API.
// Architektura Privacy-by-Design — brak zewnętrznych serwerów, klucze nigdy nie opuszczają klienta.

import type { EncryptedPayload } from "../types";

// ─── Stałe kryptograficzne ──────────────────────────────────────────────────

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bitów — zalecany rozmiar IV dla AES-GCM
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 310_000; // OWASP 2023 recommendation

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Konwertuje ArrayBuffer → string base64 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Konwertuje string base64 → ArrayBuffer */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Generuje losowy wektor inicjalizacji. */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/** Generuje losową sól. */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

// ─── Derywacja klucza ───────────────────────────────────────────────────────

/**
 * Derywuje klucz AES-GCM-256 z hasła (passphrase) za pomocą PBKDF2.
 * Używany zamiast przechowywania surowego klucza — hasło nigdy nie jest zapisywane.
 */
async function deriveKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

// ─── API publiczne ──────────────────────────────────────────────────────────

/**
 * Szyfruje dowolne dane JSON kluczem derywowanym z passphrase.
 *
 * @param data - Obiekt do zaszyfrowania (musi być serializowalny do JSON).
 * @param passphrase - Hasło użytkownika (nigdy nie jest przechowywane).
 * @returns Zaszyfrowany payload gotowy do zapisu w storage.
 *
 * @example
 * ```ts
 * const encrypted = await encrypt({ apiKey: "sk-123" }, "moje-haslo");
 * // → { iv: "...", ciphertext: "...", salt: "..." }
 * ```
 */
export async function encrypt(
  data: unknown,
  passphrase: string
): Promise<EncryptedPayload> {
  const salt = generateSalt();
  const iv = generateIV();
  const key = await deriveKey(passphrase, salt);

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    plaintext
  );

  return {
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertextBuffer),
    salt: bufferToBase64(salt.buffer),
  };
}

/**
 * Deszyfruje dane z EncryptedPayload.
 *
 * @param payload - Zaszyfrowany payload z storage.
 * @param passphrase - To samo hasło, które zostało użyte do szyfrowania.
 * @returns Odszyfrowany obiekt (parsowany z JSON).
 * @throws Error jeśli hasło jest nieprawidłowe lub dane uszkodzone.
 *
 * @example
 * ```ts
 * const data = await decrypt(encrypted, "moje-haslo");
 * // → { apiKey: "sk-123" }
 * ```
 */
export async function decrypt<T = unknown>(
  payload: EncryptedPayload,
  passphrase: string
): Promise<T> {
  const salt = new Uint8Array(base64ToBuffer(payload.salt));
  const iv = new Uint8Array(base64ToBuffer(payload.iv));
  const ciphertext = base64ToBuffer(payload.ciphertext);

  const key = await deriveKey(passphrase, salt);

  try {
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(plaintextBuffer)) as T;
  } catch {
    throw new Error(
      "Decryption failed: nieprawidłowe hasło lub uszkodzone dane."
    );
  }
}

/**
 * Generuje losowy passphrase (używany wewnętrznie gdy użytkownik nie podaje hasła).
 * Zwraca 32 znaki base64 z losowych 24 bajtów.
 */
export function generateRandomPassphrase(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return bufferToBase64(bytes.buffer);
}
