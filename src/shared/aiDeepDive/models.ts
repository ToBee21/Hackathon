// src/shared/aiDeepDive/models.ts
// Registry of selectable local models for the AI Deep-Dive risk classifier.
// One source of truth shared by the picker UI (popup) and the runtime dispatcher.
// Runtime policy is privacy-first: no silent remote model downloads. Inference
// can run only when model assets are packaged or already present in the browser
// cache; any future first-download flow must be explicit user consent.

import {
  AI_DEEP_DIVE_GEMMA_MODEL_ID,
  AI_DEEP_DIVE_LLM_JSON_MODEL_ID,
  AI_DEEP_DIVE_NLI_MODEL_ID
} from "./nliLabels"

export type AiDeepDiveModelTask =
  | "zero-shot-classification"
  | "text-generation"

export interface AiDeepDiveModelOption {
  /** Stable key persisted in config + chrome.storage. Never change once shipped. */
  id: string
  /** Short label shown in the picker. */
  label: string
  /** Transformers.js pipeline task  -  decides which runtime path handles it. */
  task: AiDeepDiveModelTask
  /** HuggingFace model id used for provenance and remote-capable fallbacks. */
  modelId: string
  /** Optional folder name under assets/models/ loaded with env.localModelPath. */
  localModelId?: string
  /** dtype on the WebGPU device path. */
  dtypeWebgpu: string
  /** dtype on the WASM (CPU) fallback path. */
  dtypeWasm: string
  /** Approximate model asset size in MB if the user explicitly provisions it. */
  approxDownloadMb: number
  /** Distribution license  -  surfaced so the operator sees redistribution risk. */
  license: string
  /** Optional operator note shown under the picker. */
  note?: string
}

export const AI_DEEP_DIVE_MODELS: readonly AiDeepDiveModelOption[] = [
  {
    id: "nli-deberta-small",
    label: "NLI DeBERTa-small (najlżejszy)",
    task: "zero-shot-classification",
    modelId: AI_DEEP_DIVE_NLI_MODEL_ID,
    dtypeWebgpu: "fp16",
    dtypeWasm: "q4",
    approxDownloadMb: 180,
    license: "MIT",
    note: "Zero-shot. Najszybszy start, zero pobierania LLM."
  },
  {
    id: "granite-350m",
    label: "Granite 4.0 350M (LLM-JSON, lekki)",
    task: "text-generation",
    modelId: AI_DEEP_DIVE_LLM_JSON_MODEL_ID,
    dtypeWebgpu: "q4",
    dtypeWasm: "q4",
    approxDownloadMb: 250,
    license: "Apache-2.0",
    note: "Generatywny JSON. Dobry kompromis jakość/rozmiar."
  },
  {
    id: "gemma-4-e2b",
    label: "Gemma 4 E2B (LLM-JSON, mocny)",
    task: "text-generation",
    modelId: AI_DEEP_DIVE_GEMMA_MODEL_ID,
    localModelId: "gemma-4-e2b",
    dtypeWebgpu: "q4",
    dtypeWasm: "q4",
    approxDownloadMb: 3460,
    license: "Apache-2.0 (Gemma 4)",
    note: "Najlepsze rozumowanie. Wagi są w pakiecie extension; wymaga WebGPU."
  }
] as const

export const DEFAULT_AI_DEEP_DIVE_MODEL_ID = "nli-deberta-small"

/** Resolve a stored model id to its option, falling back to the safe default. */
export function getModelOption(id: string | undefined): AiDeepDiveModelOption {
  const match = AI_DEEP_DIVE_MODELS.find((model) => model.id === id)
  if (match) return match
  return AI_DEEP_DIVE_MODELS.find(
    (model) => model.id === DEFAULT_AI_DEEP_DIVE_MODEL_ID
  ) as AiDeepDiveModelOption
}

export function isKnownModelId(id: string | undefined): boolean {
  return AI_DEEP_DIVE_MODELS.some((model) => model.id === id)
}
