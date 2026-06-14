export const AI_DEEP_DIVE_NLI_MODEL_ID = "Xenova/nli-deberta-v3-small"
export const AI_DEEP_DIVE_LLM_JSON_MODEL_ID =
  "onnx-community/granite-4.0-350m-ONNX-web"
// Gemma 4 E2B (Apache-2.0 since Apr 2026). ~2.58 GB; needs WebGPU to be usable.
// Same ONNX build used by Hugging Face's official Transformers.js MV3 tutorial.
export const AI_DEEP_DIVE_GEMMA_MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX"
export const AI_DEEP_DIVE_GEMMA_QAT_MOBILE_MODEL_ID =
  "onnx-community/gemma-4-E2B-it-qat-mobile-ONNX"
// Gemma 3 1B IT — TEXT-ONLY single-session ONNX (~0.76 GB q4f16). Unlike the
// multimodal Gemma 4 E2B (vision+audio encoders), this loads as a plain
// text-generation pipeline with no missing-encoder failure. The reliable LLM-JSON.
export const AI_DEEP_DIVE_GEMMA3_1B_MODEL_ID = "onnx-community/gemma-3-1b-it-ONNX"
// Qwen3.5 0.8B — TEXT-ONLY single-session ONNX (~0.47 GB q4f16), Apache-2.0,
// released Mar 2026. The "-Text-ONNX" repo is the stripped text variant; the
// plain "-ONNX" repo is MULTIMODAL (vision_encoder) — do not bundle that one here.
export const AI_DEEP_DIVE_QWEN35_08B_MODEL_ID =
  "onnx-community/Qwen3.5-0.8B-Text-ONNX"

export const AI_DEEP_DIVE_NLI_LABELS = [
  "mental health content",
  "medical condition or treatment content",
  "financial distress or debt content",
  "legal trouble content",
  "political extremism or radicalization content",
  "addiction or substance abuse content",
  "religious belief or conversion content",
  "identity or major life event content",
  "ordinary non-sensitive article"
] as const

