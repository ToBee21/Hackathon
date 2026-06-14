// scripts/bench-sensitivity.mjs
//
// The 10x, measured in the ACTUAL extension runtime (transformers.js + int8 ONNX
// on CPU). Apples-to-apples wall-clock per page:
//   TEACHER  cross-encoder/nli-deberta-v3-small  zero-shot  -> 9 forward passes
//   STUDENT  sensitivity-distil-minilm (distilled)          -> 1 forward pass
// Same machine, same backend, same input. This is the demo number.
//
//   node scripts/bench-sensitivity.mjs

import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const MODELS = join(ROOT, "assets", "models")

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

const PAGES = [
  "I've been struggling with severe anxiety and depression and my therapist suggested a new medication.",
  "Top 10 budget gaming keyboards of 2026: hands-on review of switches, latency and build quality.",
  "After the bankruptcy filing I'm drowning in credit card debt and the collection agency keeps calling.",
  "Ninety days sober today but the cravings for alcohol still hit hard at night.",
  "My lawyer says the DUI arraignment is Tuesday and I could lose my license.",
  "How to bake sourdough bread at home: a step-by-step guide for beginners."
]

const REPEAT = 5 // timing repeats per page after warmup

const ms = (a, b) => `${(b - a).toFixed(0)}ms`
const now = () => Number(process.hrtime.bigint() / 1000n) / 1000

async function main() {
  const { pipeline, env } = await import("@huggingface/transformers")
  env.allowRemoteModels = false
  env.allowLocalModels = true
  env.localModelPath = MODELS

  console.log("Loading models (int8 ONNX, CPU)…")
  const teacher = await pipeline(
    "zero-shot-classification",
    "nli-deberta-v3-small",
    { dtype: "q8", device: "cpu" }
  )
  const student = await pipeline(
    "text-classification",
    "sensitivity-distil-minilm",
    { dtype: "q8", device: "cpu" }
  )

  // sanity + warmup
  console.log("\nSanity (student, 1 pass → all 9 sigmoid scores):")
  for (const text of PAGES.slice(0, 3)) {
    const out = await student(text, { top_k: null })
    const top = out.sort((a, b) => b.score - a.score)[0]
    console.log(`   ${(top.score * 100).toFixed(0)}%  ${top.label}  ·  ${text.slice(0, 50)}`)
  }
  await teacher(PAGES[0], LABELS, { multi_label: true }) // warm teacher

  // ---- timed: teacher (9-pass) ----
  let tTeacher = 0
  for (let r = 0; r < REPEAT; r++) {
    for (const text of PAGES) {
      const a = now()
      await teacher(text, LABELS, { multi_label: true })
      tTeacher += now() - a
    }
  }
  const teacherPer = tTeacher / (REPEAT * PAGES.length)

  // ---- timed: student (1-pass) ----
  let tStudent = 0
  for (let r = 0; r < REPEAT; r++) {
    for (const text of PAGES) {
      const a = now()
      await student(text, { top_k: null })
      tStudent += now() - a
    }
  }
  const studentPer = tStudent / (REPEAT * PAGES.length)

  console.log("\n========================  THE 10x  ========================")
  console.log(`  TEACHER  nli-deberta zero-shot (9 passes, 140M, int8)`)
  console.log(`           ${teacherPer.toFixed(1)} ms/page`)
  console.log(`  STUDENT  distilled MiniLM (1 pass, 22.7M, int8)`)
  console.log(`           ${studentPer.toFixed(1)} ms/page`)
  console.log(`  ---------------------------------------------------------`)
  console.log(`  SPEEDUP  ${(teacherPer / studentPer).toFixed(1)}x faster per page`)
  console.log(`  (${REPEAT} repeats x ${PAGES.length} pages, CPU, transformers.js)`)
  console.log("===========================================================")
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e)
  process.exit(1)
})
