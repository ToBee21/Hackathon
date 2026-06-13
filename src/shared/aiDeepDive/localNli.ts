import {
  AI_DEEP_DIVE_NLI_LABELS,
  AI_DEEP_DIVE_NLI_MODEL_ID
} from "./nliLabels"
import { clamp, normalizeForRisk } from "./normalize"
import type { AiDeepDiveRuntimeConfig } from "./config"
import type {
  AiDeepDiveCategory,
  AiDeepDiveCategoryScore,
  AiDeepDiveInput,
  AiDeepDiveRiskLevel,
  AiDeepDiveRiskResult
} from "./types"

type TransformersModule = typeof import("@huggingface/transformers")
type ZeroShotOutput = {
  sequence: string
  labels: string[]
  scores: number[]
}
type ZeroShotClassifier = (
  text: string,
  labels: string[],
  options: { multi_label: boolean; hypothesis_template: string }
) => Promise<ZeroShotOutput>
type OnnxWasmPaths = { mjs: string; wasm: string }
type RuntimeUrlResolver = (path: string) => string
type TransformersRuntime = TransformersModule & {
  env?: {
    allowRemoteModels?: boolean
    backends?: {
      onnx?: {
        wasm?: {
          wasmPaths?: OnnxWasmPaths
        }
      }
    }
    logLevel?: number
    useWasmCache?: boolean
  }
  LogLevel?: {
    ERROR?: number
  }
}

const PACKAGED_ONNX_WASM_ASSET_PATHS = {
  mjs: "assets/onnxruntime/ort-wasm-simd-threaded.asyncify.mjs",
  wasm: "assets/onnxruntime/ort-wasm-simd-threaded.asyncify.wasm"
}

const LABEL_TO_CATEGORY: Partial<Record<(typeof AI_DEEP_DIVE_NLI_LABELS)[number], AiDeepDiveCategory>> = {
  "mental health content": "mental_health",
  "medical condition or treatment content": "medical",
  "financial distress or debt content": "financial_distress",
  "legal trouble content": "legal",
  "political extremism or radicalization content": "politics_extreme",
  "addiction or substance abuse content": "addiction",
  "religious belief or conversion content": "religion",
  "identity or major life event content": "identity_life_event"
}

let classifierPromise: Promise<ZeroShotClassifier> | null = null

export function shouldRunLocalNli(
  heuristic: AiDeepDiveRiskResult,
  config: AiDeepDiveRuntimeConfig
): boolean {
  if (!config.aiModeEnabled) return false
  if (heuristic.level === "low") return false
  return heuristic.score >= config.nliMinHeuristicScore
}

export function getPackagedOnnxWasmPaths(
  resolveUrl: RuntimeUrlResolver = resolveExtensionAssetUrl
): OnnxWasmPaths {
  return {
    mjs: resolveUrl(PACKAGED_ONNX_WASM_ASSET_PATHS.mjs),
    wasm: resolveUrl(PACKAGED_ONNX_WASM_ASSET_PATHS.wasm)
  }
}

export async function classifyWithLocalNli(
  input: AiDeepDiveInput,
  heuristic: AiDeepDiveRiskResult,
  config: AiDeepDiveRuntimeConfig
): Promise<AiDeepDiveRiskResult> {
  const snippet = buildNliSnippet(input, config.maxSnippetChars)
  if (!snippet) return heuristic

  const classifier = await getLocalNliClassifier()
  const output = await classifier(snippet, [...AI_DEEP_DIVE_NLI_LABELS], {
    multi_label: true,
    hypothesis_template: "This page contains {}."
  })

  return fuseNliOutput(heuristic, output)
}

export function buildNliSnippet(
  input: AiDeepDiveInput,
  maxChars: number
): string {
  return [
    input.title,
    input.meta,
    input.headings,
    pickDenseBodyChunk(input.body)
  ]
    .map((part) => normalizeForRisk(part))
    .filter(Boolean)
    .join("\n")
    .slice(0, maxChars)
}

export function fuseNliOutput(
  heuristic: AiDeepDiveRiskResult,
  output: ZeroShotOutput
): AiDeepDiveRiskResult {
  const nliCategories = output.labels
    .map((label, index) => {
      const category = LABEL_TO_CATEGORY[label as (typeof AI_DEEP_DIVE_NLI_LABELS)[number]]
      if (!category) return null
      const rawScore = output.scores[index] ?? 0
      if (rawScore < 0.5) return null
      return {
        category,
        score: Math.round(clamp(rawScore * 100, 0, 100)),
        confidence: clamp(rawScore, 0, 1),
        evidenceTags: [`nli_${category}`]
      } satisfies AiDeepDiveCategoryScore
    })
    .filter((entry): entry is AiDeepDiveCategoryScore => Boolean(entry))

  const neutralScore = output.scores[output.labels.indexOf("ordinary non-sensitive article")] ?? 0
  const nliMax = Math.max(0, ...nliCategories.map((entry) => entry.score))
  const mergedCategories = mergeCategories(heuristic.categories, nliCategories)
  const score =
    neutralScore > 0.72 && nliMax < 55
      ? Math.min(heuristic.score, 45)
      : Math.max(heuristic.score, nliMax)

  return {
    ...heuristic,
    level: levelForScore(score),
    score,
    confidence: clamp(
      Math.max(heuristic.confidence, neutralScore > 0.72 ? 0.68 : nliMax / 100),
      0,
      1
    ),
    categories: mergedCategories,
    evidenceTags: Array.from(
      new Set([...heuristic.evidenceTags, ...nliCategories.flatMap((entry) => entry.evidenceTags)])
    ).slice(0, 10),
    model: {
      mode: "heuristic+nli",
      id: AI_DEEP_DIVE_NLI_MODEL_ID,
      localOnly: true
    },
    rawTextRetained: false
  }
}

async function getLocalNliClassifier(): Promise<ZeroShotClassifier> {
  if (!classifierPromise) {
    classifierPromise = loadLocalNliClassifier()
  }
  return classifierPromise
}

async function loadLocalNliClassifier(): Promise<ZeroShotClassifier> {
  const transformers = (await import("@huggingface/transformers")) as TransformersModule
  configureTransformersRuntime(transformers)

  const nav = navigator as Navigator & { gpu?: unknown }
  const classifier = await transformers.pipeline(
    "zero-shot-classification",
    AI_DEEP_DIVE_NLI_MODEL_ID,
    {
      device: nav.gpu ? "webgpu" : "wasm",
      dtype: nav.gpu ? "fp16" : "q4"
    }
  )

  return classifier as unknown as ZeroShotClassifier
}

function configureTransformersRuntime(transformers: TransformersModule): void {
  const runtime = transformers as TransformersRuntime
  const env = runtime.env
  const onnxWasm = env?.backends?.onnx?.wasm
  if (!env || !onnxWasm) return

  onnxWasm.wasmPaths = getPackagedOnnxWasmPaths()
  env.useWasmCache = true
  env.allowRemoteModels = true

  const errorLevel = runtime.LogLevel?.ERROR
  if (typeof errorLevel === "number") {
    env.logLevel = errorLevel
  }
}

function resolveExtensionAssetUrl(path: string): string {
  const maybeChrome = (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: { getURL?: RuntimeUrlResolver } }
    }
  ).chrome

  return maybeChrome?.runtime?.getURL?.(path) ?? path
}

function pickDenseBodyChunk(body: string): string {
  return body
    .split(/\n{1,}|\.\s+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 80)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .join("\n")
}

function mergeCategories(
  heuristic: AiDeepDiveCategoryScore[],
  nli: AiDeepDiveCategoryScore[]
): AiDeepDiveCategoryScore[] {
  const byCategory = new Map<AiDeepDiveCategory, AiDeepDiveCategoryScore>()

  for (const entry of [...heuristic, ...nli]) {
    const previous = byCategory.get(entry.category)
    if (!previous) {
      byCategory.set(entry.category, entry)
      continue
    }

    byCategory.set(entry.category, {
      category: entry.category,
      score: Math.max(previous.score, entry.score),
      confidence: Math.max(previous.confidence, entry.confidence),
      evidenceTags: Array.from(new Set([...previous.evidenceTags, ...entry.evidenceTags])).slice(0, 6)
    })
  }

  return Array.from(byCategory.values()).sort((a, b) => b.score - a.score).slice(0, 5)
}

function levelForScore(score: number): AiDeepDiveRiskLevel {
  if (score >= 80) return "critical"
  if (score >= 55) return "high"
  if (score >= 25) return "medium"
  return "low"
}
