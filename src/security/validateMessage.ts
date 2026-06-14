import { containsForbiddenLogField, isRecord } from "./privacyGuards"

export const CND_MESSAGE_TYPES = [
  "CND_OPEN_SIDE_PANEL",
  "CND_ANALYSIS_UPDATED",
  "CND_DEEP_SCAN",
  "CND_OFFSCREEN_INFER",
  "CND_OFFSCREEN_LOG",
  "CND_DEEP_SCAN_STATUS",
  "CND_REQUEST_ANALYSIS",
  "CND_TOGGLE_FLOATING",
  "CND_RESCAN",
  "CND_VISION_TRIGGER",
  "CND_VISION_SCAN",
  "CND_VISION_INFER"
] as const

const CND_MESSAGE_TYPE_SET = new Set<string>(CND_MESSAGE_TYPES)
const PAGE_ANALYSIS_SOURCES = new Set(["heuristic", "nli", "llm-json", "fused"])
const MODEL_IDS = new Set([
  "nli-deberta-small",
  "gemma-3-1b",
  "qwen3-5-08b"
])
const VISION_PNG_DATA_URL_PREFIX = "data:image/png;base64,"
const VISION_IMAGE_MAX_CHARS = 24_000_000
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

export function isKnownCndMessage(value: unknown): boolean {
  if (!isRecord(value) || !isCndMessageType(value.type)) return false

  switch (value.type) {
    case "CND_OPEN_SIDE_PANEL":
    case "CND_REQUEST_ANALYSIS":
    case "CND_RESCAN":
    case "CND_VISION_TRIGGER":
    case "CND_VISION_SCAN":
      return true
    case "CND_VISION_INFER":
      // Page-side classify round-trip: a PNG dataURL (bounded — a viewport
      // screenshot is a few MB) + optional request id. Handled by the offscreen.
      return (
        isOptionalRequestId(value.requestId) &&
        isPngDataUrl(value.image, VISION_IMAGE_MAX_CHARS)
      )
    case "CND_TOGGLE_FLOATING":
      return typeof value.enabled === "boolean"
    case "CND_ANALYSIS_UPDATED":
      return isPageAnalysis(value.analysis)
    case "CND_DEEP_SCAN":
    case "CND_OFFSCREEN_INFER":
      return (
        isOptionalRequestId(value.requestId) &&
        isAiDeepDiveInput(value.input) &&
        isAiDeepDiveRuntimeConfig(value.config)
      )
    case "CND_OFFSCREEN_LOG":
      return isSafeRuntimeStatus(value.entry)
    case "CND_DEEP_SCAN_STATUS":
      return isSafeRuntimeStatus(value.status)
  }
}

export function isCndMessageType(value: unknown): value is (typeof CND_MESSAGE_TYPES)[number] {
  return typeof value === "string" && CND_MESSAGE_TYPE_SET.has(value)
}

function isPageAnalysis(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (!isRecord(value.page)) return false
  if (!Array.isArray(value.cards)) return false
  if (!PAGE_ANALYSIS_SOURCES.has(String(value.source))) return false
  if (!isFiniteNumber(value.capturedAt)) return false
  if (value.modelId !== undefined && !isBoundedString(value.modelId, 128)) return false
  if (value.tabId !== undefined && !isSafeInteger(value.tabId)) return false
  return value.cards.length <= 64
}

function isAiDeepDiveInput(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    isBoundedString(value.title, 512) &&
    isBoundedString(value.meta, 2048) &&
    isBoundedString(value.headings, 4000) &&
    isBoundedString(value.body, 16_000) &&
    isBoundedString(value.origin, 2048) &&
    (value.path === undefined || isBoundedString(value.path, 4096))
  )
}

function isAiDeepDiveRuntimeConfig(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.aiModeEnabled === "boolean" &&
    MODEL_IDS.has(String(value.selectedModelId)) &&
    isNumberInRange(value.nliMinHeuristicScore, 0, 100) &&
    isNumberInRange(value.maxSnippetChars, 500, 4000)
  )
}

function isSafeRuntimeStatus(value: unknown): boolean {
  if (!isRecord(value) || containsForbiddenLogField(value)) return false
  return (
    isFiniteNumber(value.ts) &&
    isBoundedString(value.level, 16) &&
    isBoundedString(value.stage, 96) &&
    isFiniteNumber(value.elapsedMs)
  )
}

function isOptionalRequestId(value: unknown): boolean {
  return value === undefined || isBoundedString(value, 128)
}

function isBoundedString(value: unknown, maxChars: number): value is string {
  return typeof value === "string" && value.length <= maxChars
}

function isPngDataUrl(value: unknown, maxChars: number): value is string {
  if (!isBoundedString(value, maxChars)) return false
  if (!value.startsWith(VISION_PNG_DATA_URL_PREFIX)) return false
  const payload = value.slice(VISION_PNG_DATA_URL_PREFIX.length)
  return payload.length > 0 && payload.length % 4 === 0 && BASE64_RE.test(payload)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max
}
