// src/shared/aiDeepDive/models.ts
// Registry of selectable local models for the AI Deep-Dive risk classifier.
// One source of truth shared by the picker UI (popup) and the runtime dispatcher.
// Runtime policy is privacy-first: no silent remote model downloads. Inference
// can run only when model assets are packaged or already present in the browser
// cache; any future first-download flow must be explicit user consent.

import {
  AI_DEEP_DIVE_GEMMA3_1B_MODEL_ID,
  AI_DEEP_DIVE_NLI_MODEL_ID,
  AI_DEEP_DIVE_QWEN35_08B_MODEL_ID
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
    localModelId: "nli-deberta-v3-small",
    dtypeWebgpu: "fp16",
    dtypeWasm: "q8",
    approxDownloadMb: 165,
    license: "MIT",
    note: "Zero-shot na CPU/WASM. W pakiecie offline (~165 MB), bez WebGPU. Domyślny."
  },
  {
    id: "gemma-3-1b",
    label: "Gemma 3 1B (LLM-JSON, pewny)",
    task: "text-generation",
    modelId: AI_DEEP_DIVE_GEMMA3_1B_MODEL_ID,
    localModelId: "gemma-3-1b",
    dtypeWebgpu: "q4f16",
    dtypeWasm: "q4f16",
    approxDownloadMb: 763,
    license: "Gemma Terms of Use",
    note:
      "Text-only, ~0.76 GB. UWAGA licencja: Gemma jest objęta Gemma Terms of Use (ai.google.dev/gemma/terms) i Prohibited Use Policy — nie jest open-source. Jedna sesja ONNX, WebGPU."
  },
  {
    id: "qwen3-5-08b",
    label: "Qwen3.5 0.8B (LLM-JSON, najnowszy)",
    task: "text-generation",
    modelId: AI_DEEP_DIVE_QWEN35_08B_MODEL_ID,
    localModelId: "qwen3-5-08b-text",
    dtypeWebgpu: "q4f16",
    dtypeWasm: "q4f16",
    approxDownloadMb: 470,
    license: "Apache-2.0",
    note:
      "Text-only, ~0.47 GB. Najnowszy (mar 2026), Apache-2.0, lżejszy od Gemmy. Wymaga WebGPU."
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
