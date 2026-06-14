const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{24,}\b/g
const RAW_EXCERPT_PATTERN = /Raw excerpt:\s*[\s\S]*$/gi

const MAX_LOG_TEXT_CHARS = 240
const MAX_LABEL_CHARS = 96
const MAX_ARRAY_ITEMS = 12
const MAX_ELAPSED_MS = 10 * 60 * 1000

const ALLOWED_LEVELS = new Set(["info", "warn", "error"])
const FORBIDDEN_LOG_FIELDS = new Set([
  "apiKey",
  "apiToken",
  "authorization",
  "body",
  "ciphertext",
  "headings",
  "html",
  "input",
  "jsonText",
  "meta",
  "password",
  "prompt",
  "rawExcerpt",
  "rawText",
  "secret",
  "stack",
  "streamText",
  "textDelta",
  "title",
  "token"
])

export interface SafeOffscreenLogEntry {
  ts: number
  level: "info" | "warn" | "error"
  stage: string
  elapsedMs: number
  requestId?: string
  modelId?: string
  selectedModelId?: string
  device?: string
  dtype?: string
  selectedDtype?: string
  fallbackDtype?: string
  candidateDtypes?: string[]
  attemptedDtypes?: string[]
  cacheHit?: boolean
  outputChars?: number
  error?: string
  redactedFields?: string[]
}

export function redactSensitiveText(value: unknown, maxChars = MAX_LOG_TEXT_CHARS): string {
  const text = typeof value === "string" ? value : stringifyErrorLike(value)
  const redacted = text
    .replace(RAW_EXCERPT_PATTERN, "Raw excerpt: [redacted]")
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(LONG_TOKEN_PATTERN, "[redacted-token]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()

  if (redacted.length <= maxChars) return redacted
  return `${redacted.slice(0, Math.max(0, maxChars - 1))}…`
}

export function sanitizeLogMessage(value: unknown): string {
  return redactSensitiveText(value, MAX_LOG_TEXT_CHARS)
}

export function sanitizeOffscreenLogEntry(value: unknown): SafeOffscreenLogEntry {
  const record = isRecord(value) ? value : {}
  const redactedFields = Object.keys(record).filter((key) => FORBIDDEN_LOG_FIELDS.has(key))

  const entry: SafeOffscreenLogEntry = {
    ts: finiteNumber(record.ts) ?? Date.now(),
    level: sanitizeLevel(record.level),
    stage: sanitizeLabel(record.stage, "unknown"),
    elapsedMs: clampNumber(finiteNumber(record.elapsedMs) ?? 0, 0, MAX_ELAPSED_MS)
  }

  copyString(record, entry, "requestId")
  copyString(record, entry, "modelId")
  copyString(record, entry, "selectedModelId")
  copyString(record, entry, "device")
  copyString(record, entry, "dtype")
  copyString(record, entry, "selectedDtype")
  copyString(record, entry, "fallbackDtype")
  copyStringArray(record, entry, "candidateDtypes")
  copyStringArray(record, entry, "attemptedDtypes")

  if (typeof record.cacheHit === "boolean") entry.cacheHit = record.cacheHit
  if (typeof record.outputChars === "number" && Number.isFinite(record.outputChars)) {
    entry.outputChars = clampNumber(record.outputChars, 0, 1_000_000)
  }
  if ("error" in record) entry.error = redactSensitiveText(record.error)
  if (redactedFields.length > 0) entry.redactedFields = redactedFields.sort()

  return entry
}

export function containsForbiddenLogField(value: unknown): boolean {
  if (!isRecord(value)) return false
  return Object.keys(value).some((key) => FORBIDDEN_LOG_FIELDS.has(key))
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sanitizeLevel(value: unknown): SafeOffscreenLogEntry["level"] {
  return typeof value === "string" && ALLOWED_LEVELS.has(value)
    ? (value as SafeOffscreenLogEntry["level"])
    : "info"
}

function sanitizeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim().length === 0) return fallback
  return redactSensitiveText(value, MAX_LABEL_CHARS)
}

function copyString(
  source: Record<string, unknown>,
  target: SafeOffscreenLogEntry,
  key: keyof SafeOffscreenLogEntry
): void {
  const value = source[key]
  if (typeof value === "string" && value.trim().length > 0) {
    ;(target as unknown as Record<string, unknown>)[key] = sanitizeLabel(value, "")
  }
}

function copyStringArray(
  source: Record<string, unknown>,
  target: SafeOffscreenLogEntry,
  key: "candidateDtypes" | "attemptedDtypes"
): void {
  const value = source[key]
  if (!Array.isArray(value)) return
  target[key] = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeLabel(item, "unknown"))
    .slice(0, MAX_ARRAY_ITEMS)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function stringifyErrorLike(value: unknown): string {
  if (value instanceof Error) return value.message
  if (isRecord(value)) {
    const name = typeof value.name === "string" ? value.name : "Error"
    const message = typeof value.message === "string" ? value.message : JSON.stringify(value)
    return `${name}: ${message}`
  }
  return String(value ?? "")
}
