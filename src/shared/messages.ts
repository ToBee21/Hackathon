// src/shared/messages.ts
// Typed message contracts for the floating contextual layer. These are additive
// to the existing background message API (src/types.ts)  -  they namespace under
// "CND_" so they never collide with the legacy NOISE_*/STATE_UPDATE messages.
//
// Trust boundary note: messages crossing content-script <-> service-worker are
// JSON-serializable only. Never put secrets, tokens, or raw model prompts on the
// wire to a content script; the page shares that process's DOM.

import type { PageContext } from "./pageContextSchema"
import type { FeatureCard } from "./featureRegistry"
import type { AiDeepDiveRuntimeConfig } from "./aiDeepDive/config"
import type { AiDeepDiveInput, AiDeepDiveRiskResult } from "./aiDeepDive/types"
import { isKnownCndMessage } from "../security/validateMessage"

export interface PageAnalysis {
  page: PageContext
  cards: FeatureCard[]
  /** Where the headline verdict came from  -  never lie about this. */
  source: "heuristic" | "nli" | "llm-json" | "fused"
  modelId?: string
  tabId?: number
  capturedAt: number
}

export interface DeepScanResponse {
  ok: boolean
  result?: AiDeepDiveRiskResult
  error?: string
  requestId?: string
}

export interface DeepScanRuntimeStatus {
  ts: number
  level: string
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

export type CndContentMessage =
  // content-script -> service-worker
  | { type: "CND_OPEN_SIDE_PANEL"; tabId?: number }
  | { type: "CND_ANALYSIS_UPDATED"; analysis: PageAnalysis }
  // content-script -> service-worker -> offscreen (heavy local inference)
  | { type: "CND_DEEP_SCAN"; requestId?: string; input: AiDeepDiveInput; config: AiDeepDiveRuntimeConfig }
  // service-worker -> offscreen document
  | { type: "CND_OFFSCREEN_INFER"; requestId?: string; input: AiDeepDiveInput; config: AiDeepDiveRuntimeConfig }
  // offscreen -> service-worker -> content-script telemetry
  | { type: "CND_OFFSCREEN_LOG"; entry: DeepScanRuntimeStatus }
  | { type: "CND_DEEP_SCAN_STATUS"; status: DeepScanRuntimeStatus }
  // service-worker / popup -> content-script
  | { type: "CND_REQUEST_ANALYSIS" }
  | { type: "CND_TOGGLE_FLOATING"; enabled: boolean }
  | { type: "CND_RESCAN" }
  // AI Vision ad-image scan:
  // page UI button -> SW (ensure offscreen, then poke the tab's content script)
  | { type: "CND_VISION_TRIGGER" }
  // SW -> content-script: harvest + classify + blur ad images now
  | { type: "CND_VISION_SCAN" }
  // content-script -> offscreen document: classify one image (PNG dataURL)
  | { type: "CND_VISION_INFER"; requestId?: string; image: string }

export function isCndMessage(value: unknown): value is CndContentMessage {
  return isKnownCndMessage(value)
}
