export const AI_DEEP_DIVE_NLI_MODEL_ID = "Xenova/nli-deberta-v3-small"
export const AI_DEEP_DIVE_LLM_JSON_MODEL_ID =
  "onnx-community/granite-4.0-350m-ONNX-web"
// Gemma 4 E2B (Apache-2.0 since Apr 2026). ~2.58 GB; needs WebGPU to be usable.
// Same ONNX build used by Hugging Face's official Transformers.js MV3 tutorial.
export const AI_DEEP_DIVE_GEMMA_MODEL_ID = "onnx-community/gemma-4-E2B-it-ONNX"

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

