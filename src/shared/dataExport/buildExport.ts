// src/shared/dataExport/buildExport.ts
// "User owns his data" — pure, dependency-free assembly of a local JSON export
// bundle of EVERYTHING the extension knows about the user locally.
//
// HARD privacy contract: no credential ever leaves in the file. Any top-level OR
// nested object key matching the secret pattern is redacted — the value is
// replaced with the literal string "[redacted]" and its key path is recorded in
// redactedKeys. The user's OWN data (state, aliases, footprint, navigator info)
// is intentionally KEPT — this export exists so the user can download it.
//
// Zero network, zero DOM, fully synchronous → unit-testable.

export interface DataExportInput {
  storage: Record<string, unknown>
  shadowAudit?: unknown
  dataFootprint?: unknown
  browser?: Record<string, unknown>
  now: number
  appVersion: string
}

export interface DataExportBundle {
  schema: "cloak-dagger/data-export"
  schemaVersion: 1
  app: "PrivacyMyst"
  appVersion: string
  exportedAt: string
  browser?: Record<string, unknown>
  shadowAudit?: unknown
  dataFootprint?: unknown
  storage: Record<string, unknown>
  redactedKeys: string[]
}

const REDACTED = "[redacted]"

// Case-insensitive secret-key pattern. Matches top-level AND nested object keys.
// Covers the exact lead-verified keys ("cnd:api-tokens-encrypted",
// "cnd:crypto-session-key") via the token / api-key / crypto / \bkey\b alternatives.
const SECRET_KEY_PATTERN =
  /(token|secret|password|passphrase|signing|private[-_]?key|crypto|api[-_]?key|\bkey\b)/i

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  )
}

/**
 * Recursively redacts secret-keyed entries from a snapshot.
 *
 * - For each plain-object key matching the secret pattern, the value becomes
 *   "[redacted]" and the key path is recorded.
 * - Non-secret object keys are recursed into.
 * - Arrays are recursed into (by index) but array indices themselves are never
 *   treated as secret keys.
 *
 * Returns a NEW deep-ish structure; the input is never mutated.
 */
export function redactStorageSnapshot(raw: Record<string, unknown>): {
  data: Record<string, unknown>
  redactedKeys: string[]
} {
  const redactedKeys: string[] = []

  const walkObject = (
    obj: Record<string, unknown>,
    prefix: string
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (isSecretKey(key)) {
        out[key] = REDACTED
        redactedKeys.push(path)
        continue
      }
      out[key] = walkValue(obj[key], path)
    }
    return out
  }

  const walkValue = (value: unknown, path: string): unknown => {
    if (Array.isArray(value)) {
      return value.map((item, index) => walkValue(item, `${path}[${index}]`))
    }
    if (isPlainObject(value)) {
      return walkObject(value, path)
    }
    return value
  }

  const data = walkObject(raw, "")
  return { data, redactedKeys }
}

/**
 * Assembles the export bundle. Optional sections (browser / shadowAudit /
 * dataFootprint) are omitted entirely when not provided. Storage is redacted.
 */
export function buildDataExport(input: DataExportInput): DataExportBundle {
  const { data, redactedKeys } = redactStorageSnapshot(input.storage)

  const bundle: DataExportBundle = {
    schema: "cloak-dagger/data-export",
    schemaVersion: 1,
    app: "PrivacyMyst",
    appVersion: input.appVersion,
    exportedAt: new Date(input.now).toISOString(),
    storage: data,
    redactedKeys
  }

  if (input.browser !== undefined) bundle.browser = input.browser
  if (input.shadowAudit !== undefined) bundle.shadowAudit = input.shadowAudit
  if (input.dataFootprint !== undefined) bundle.dataFootprint = input.dataFootprint

  return bundle
}

/** Pretty (2-space) JSON serialization of the bundle. */
export function serializeDataExport(bundle: DataExportBundle): string {
  return JSON.stringify(bundle, null, 2)
}
