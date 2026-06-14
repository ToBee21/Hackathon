import { STORAGE_KEYS } from "../types"

export const SENSITIVE_STORAGE_KEYS = new Set<string>([
  STORAGE_KEYS.API_TOKENS,
  STORAGE_KEYS.EMAIL_ALIASES,
  STORAGE_KEYS.CRYPTO_KEY
])

export function requiresEncryptedStorage(key: string): boolean {
  return SENSITIVE_STORAGE_KEYS.has(key)
}
