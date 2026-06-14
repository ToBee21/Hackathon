import { shouldLogAiDeepDiveReport } from "../../shared/aiDeepDive/reportPolicy"
import type { AiDeepDiveRiskResult } from "../../shared/aiDeepDive/types"
import { escalateTargetingForOrigin } from "../../shared/targetingShield"
import { escalateBlocklistForOrigin } from "../../shared/blocklist"
import { deriveMaxCamoPatch } from "./maxCamoPolicy"
import { createRateLimiter } from "./rateLimit"

const STORAGE_KEY_STATE = "cnd:state"
const STORAGE_KEY_TOGGLES = "cnd:toggles"
const STORAGE_KEY_BIONIC_CONFIG = "cnd:bionic-blur:config"
const LOG_RATE_LIMIT_MS = 30_000

const allowLog = createRateLimiter(LOG_RATE_LIMIT_MS)

interface HandlerDeps {
  storage: chrome.storage.LocalStorageArea
  sendRuntimeMessage: (message: Record<string, unknown>) => void
  injectNoise: (count?: number) => Promise<void>
}

export async function handleAiDeepDiveRiskResult(
  result: AiDeepDiveRiskResult,
  deps: HandlerDeps
): Promise<{ success: boolean; maxCamo: boolean }> {
  const compact = sanitizeRiskResult(result)
  const maxCamo = deriveMaxCamoPatch(compact)
  const stored = await deps.storage.get({
    [STORAGE_KEY_STATE]: {},
    [STORAGE_KEY_TOGGLES]: {},
    [STORAGE_KEY_BIONIC_CONFIG]: {}
  })
  const previousState = (stored[STORAGE_KEY_STATE] ?? {}) as Record<string, unknown>
  const previousToggles = (stored[STORAGE_KEY_TOGGLES] ?? {}) as Record<string, unknown>
  const previousBionic = (stored[STORAGE_KEY_BIONIC_CONFIG] ?? {}) as Record<string, unknown>
  const detectionCount =
    typeof previousState.aiDeepDiveDetectionCount === "number"
      ? previousState.aiDeepDiveDetectionCount + 1
      : 1
  const nextState = {
    ...previousState,
    aiDeepDiveRisk: compact,
    aiDeepDiveDetectionCount: detectionCount,
    maxCamoActive: Boolean(maxCamo)
  }

  const values: Record<string, unknown> = {
    [STORAGE_KEY_STATE]: nextState
  }

  if (maxCamo) {
    values[STORAGE_KEY_TOGGLES] = {
      ...previousToggles,
      ...maxCamo.toggles
    }
    values[STORAGE_KEY_BIONIC_CONFIG] = {
      ...previousBionic,
      ...maxCamo.bionicBlur
    }
  }

  await deps.storage.set(values)

  deps.sendRuntimeMessage({
    type: "STATE_UPDATE",
    state: {
      aiDeepDiveRisk: compact,
      aiDeepDiveDetectionCount: detectionCount,
      maxCamoActive: Boolean(maxCamo)
    }
  })

  maybeLogDetection(compact, Boolean(maxCamo), deps.sendRuntimeMessage)

  // Filtrowanie agresywnego targetowania: na wrażliwej stronie (high/critical)
  // odetnij wszystkie hosty targetujące dla tego originu. Self-gating + bezpieczne
  // w testach (no-op bez chrome/DNR).
  void escalateTargetingForOrigin(compact.origin, compact.level)
  // Risk-adaptive blocklist: na wrażliwym originie włącz "escalated" tier feedów
  // (scorched earth), scoped do tego originu. Self-gating + no-op bez DNR.
  void escalateBlocklistForOrigin(compact.origin, compact.level)

  if (maxCamo && compact.level === "critical") {
    deps.injectNoise(maxCamo.dataGhostBatchSize).catch(() => undefined)
  }

  return { success: true, maxCamo: Boolean(maxCamo) }
}

function sanitizeRiskResult(result: AiDeepDiveRiskResult): AiDeepDiveRiskResult {
  return {
    type: "AI_DEEP_DIVE_RESULT",
    version: 1,
    level: result.level,
    score: clampInt(result.score, 0, 100),
    confidence: clampNumber(result.confidence, 0, 1),
    categories: result.categories
      .slice(0, 4)
      .map((entry) => ({
        category: entry.category,
        score: clampInt(entry.score, 0, 100),
        confidence: clampNumber(entry.confidence, 0, 1),
        evidenceTags: entry.evidenceTags.slice(0, 4)
      })),
    evidenceTags: result.evidenceTags.slice(0, 8),
    origin: safeOrigin(result.origin),
    urlHash: result.urlHash,
    timestamp: Number.isFinite(result.timestamp) ? result.timestamp : Date.now(),
    ...(result.model?.localOnly
      ? {
          model: {
            mode: result.model.mode,
            id: result.model.id,
            localOnly: true as const
          }
        }
      : {}),
    rawTextRetained: false
  }
}

function maybeLogDetection(
  result: AiDeepDiveRiskResult,
  maxCamo: boolean,
  sendRuntimeMessage: HandlerDeps["sendRuntimeMessage"]
): void {
  if (!shouldLogAiDeepDiveReport(result)) return

  const key = `${result.origin}:${result.urlHash}:${result.level}`
  if (!allowLog(key)) return

  const categories = result.categories
    .slice(0, 2)
    .map((entry) => entry.category)
    .join(", ")
  const tail = maxCamo ? " · max camo enabled" : " · dashboard only"

  sendRuntimeMessage({
    type: "LOG_EVENT",
    entry: {
      timestamp: result.timestamp,
      source: "aiDeepDive",
      message: `AI Deep-Dive: ${result.level} risk · ${categories || "sensitive context"}${tail}`,
      count: 1
    }
  })
}

function safeOrigin(value: string): string {
  try {
    const parsed = new URL(value)
    if (parsed.origin !== "null") return parsed.origin
    if (parsed.protocol === "file:") return "file://local"
    if (parsed.protocol === "about:") {
      return `about://${parsed.hostname || parsed.pathname || "blank"}`
    }

    const host = parsed.hostname || parsed.pathname.split("/").find(Boolean)
    return host ? `${parsed.protocol}//${host}` : "unknown-origin"
  } catch {
    return "unknown-origin"
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max))
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}
