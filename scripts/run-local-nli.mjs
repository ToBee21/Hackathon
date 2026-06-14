// scripts/run-local-nli.mjs
//
// A small, sure, OFFLINE local-inference run: load the bundled
// cross-encoder/nli-deberta-v3-small (int8 ONNX) on plain CPU via
// onnxruntime-node and zero-shot-classify sample page text against the product's
// real sensitive-topic labels — exactly the signal that drives risk-adaptive
// blocking. No network, no WebGPU, no browser.
//
//   node scripts/run-local-nli.mjs

import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MODELS_DIR = join(ROOT, "assets", "models")
const MODEL_ID = "nli-deberta-v3-small" // resolves to assets/models/<id>

// Mirror src/shared/aiDeepDive/nliLabels.ts (AI_DEEP_DIVE_NLI_LABELS).
const LABELS = [
  "mental health content",
  "medical condition or treatment content",
  "financial distress or debt content",
  "legal trouble content",
  "political extremism or radicalization content",
  "addiction or substance abuse content",
  "religious belief or conversion content",
  "identity or major life event content",
  "ordinary non-sensitive article"
]

const SAMPLES = [
  "I've been struggling with severe anxiety and depression for months and my therapist suggested I try a new medication.",
  "Top 10 budget gaming keyboards of 2026: our hands-on review of switches, latency and build quality.",
  "After the bankruptcy filing I'm drowning in credit card debt and the collection agency keeps calling every day."
]

async function main() {
  const t0 = Date.now()
  const { pipeline, env } = await import("@huggingface/transformers")

  // Hard-offline: only the local folder, never the HF hub.
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = MODELS_DIR

  console.log(`transformers.js loaded · models dir: ${MODELS_DIR}`)
  console.log(`Loading ${MODEL_ID} (int8, CPU/onnxruntime-node)…`)

  const classifier = await pipeline("zero-shot-classification", MODEL_ID, {
    dtype: "q8", // selects onnx/model_quantized.onnx
    device: "cpu"
  })
  console.log(`Model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)

  for (const text of SAMPLES) {
    const out = await classifier(text, LABELS, { multi_label: true })
    const top = out.labels
      .map((label, i) => ({ label, score: out.scores[i] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
    console.log(`TEXT: ${text}`)
    for (const { label, score } of top) {
      console.log(`   ${(score * 100).toFixed(1)}%  ${label}`)
    }
    console.log("")
  }

  console.log(
    `OK — ${SAMPLES.length} pages classified locally in ${((Date.now() - t0) / 1000).toFixed(1)}s, zero network.`
  )
}

main().catch((err) => {
  console.error("\nFAILED:", err?.message || err)
  process.exit(1)
})
