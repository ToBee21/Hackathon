// src/shared/aiDeepDive/localLlm.ts
// Generative "LLM-JSON" risk classifier  -  the heavier tier above zero-shot NLI.
// Runs a small instruct model fully on-device via Transformers.js text-generation
// (WebGPU, WASM fallback), prompts it for a strict JSON verdict, parses + clamps
// it, and fuses into the same AiDeepDiveRiskResult shape the heuristic/NLI paths
// use. The page text is always passed as untrusted DATA, never as instructions.

import type { AiDeepDiveRuntimeConfig } from "./config"
import {
  AI_DEEP_DIVE_ALLOWED_CATEGORIES,
  buildAiDeepDiveContextPack
} from "./contextEngineering"
import {
  buildNliSnippet,
  configureTransformersRuntime,
  levelForScore,
  mergeCategories
} from "./localNli"
import type { AiDeepDiveModelOption } from "./models"
import { clamp } from "./normalize"
import type {
  AiDeepDiveCategory,
  AiDeepDiveCategoryScore,
  AiDeepDiveInput,
  AiDeepDiveRiskResult
} from "./types"

type TransformersModule = typeof import("@huggingface/transformers")
type PipelineFn = (
  task: string,
  model: string,
  options: Record<string, unknown>
) => Promise<unknown>
type ModelRegistryLike = {
  get_available_dtypes?: (modelId: string) => Promise<string[]>
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string }
type GeneratedItem = { generated_text?: string | ChatMessage[] }
type TextGenerator = (
  messages: ChatMessage[],
  options: Record<string, unknown>
) => Promise<GeneratedItem[]>
type TextGeneratorRuntime = {
  generator: TextGenerator
  device: "webgpu"
  dtype: string
}

// The 8 sensitive categories the heuristic + UI already understand. The model is
// constrained to these; anything else it emits is discarded during parsing.
const RISK_CATEGORIES: readonly AiDeepDiveCategory[] = [
  ...AI_DEEP_DIVE_ALLOWED_CATEGORIES
]

const CATEGORY_MIN_SCORE = 50
const LLM_MAX_NEW_TOKENS = 180

interface ParsedLlmRisk {
  risk: number
  categories: Array<{ category: AiDeepDiveCategory; score: number }>
  reason?: string
  source?: string
  modelId?: string
}

// Cache per exact runtime path. q4 can fail on browser/ORT WebGPU kernels, while
// fp16 may still be a valid demo path for the same LLM.
const generatorPromises = new Map<string, Promise<TextGeneratorRuntime>>()
const generatorLoadFailures = new Map<string, Error>()

export async function classifyWithLocalLlm(
  input: AiDeepDiveInput,
  heuristic: AiDeepDiveRiskResult,
  config: AiDeepDiveRuntimeConfig,
  model: AiDeepDiveModelOption
): Promise<AiDeepDiveRiskResult> {
  const snippet = buildNliSnippet(input, config.maxSnippetChars)
  if (!snippet) return heuristic

  const runtime = await getGenerator(model)
  const output = await runtime.generator(
    buildLlmMessagesForModel(snippet, model),
    {
      max_new_tokens: LLM_MAX_NEW_TOKENS,
      do_sample: false,
      return_full_text: false
    }
  )

  const generatedText = readGeneratedText(output)
  const parsed = parseLlmRiskJson(generatedText)
  if (!parsed) {
    throw new Error("LLM JSON parse failed; raw model output was discarded")
  }

  return fuseLlmOutput(heuristic, parsed, model)
}

export function buildLlmMessages(snippet: string): ChatMessage[] {
  return buildLlmMessagesForModel(snippet, {
    id: "granite-350m",
    label: "Granite 4.0 350M (LLM-JSON, lekki)",
    task: "text-generation",
    modelId: "local",
    dtypeWebgpu: "q4",
    dtypeWasm: "q4",
    approxDownloadMb: 250,
    license: "Apache-2.0"
  })
}

export function buildLlmMessagesForModel(
  snippet: string,
  model: AiDeepDiveModelOption
): ChatMessage[] {
  return buildAiDeepDiveContextPack({ snippet, model }).messages as ChatMessage[]
}

// Transformers.js text-generation with a chat input returns the full conversation
// as generated_text (array of role/content); the last entry is the assistant turn.
export function readGeneratedText(output: GeneratedItem[]): string {
  const first = Array.isArray(output) ? output[0] : undefined
  const generated = first?.generated_text
  if (typeof generated === "string") return generated
  if (Array.isArray(generated)) {
    const last = generated[generated.length - 1]
    return typeof last?.content === "string" ? last.content : ""
  }
  return ""
}

// Tolerant parse: pull the first {...} block out of whatever the model emitted,
// validate categories against the allowed set, clamp scores. Returns null on any
// malformed output so the caller can fall back to the heuristic result.
export function parseLlmRiskJson(text: string): ParsedLlmRisk | null {
  const json = extractFirstJsonObject(text)
  if (!json) return null

  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!raw || typeof raw !== "object") return null

  const obj = raw as Record<string, unknown>
  const allowed = new Set<string>(RISK_CATEGORIES)
  const rawCategories = Array.isArray(obj.sensitiveSignals)
    ? obj.sensitiveSignals
    : Array.isArray(obj.categories)
      ? obj.categories
      : []
  const categories = rawCategories
        .map((entry) => {
          const record = entry as Record<string, unknown>
          const category = String(record?.category ?? "")
          if (!allowed.has(category)) return null
          return {
            category: category as AiDeepDiveCategory,
            score: clamp(toNumber(record?.score), 0, 100)
          }
        })
        .filter(
          (entry): entry is { category: AiDeepDiveCategory; score: number } =>
            Boolean(entry)
        )

  const score = Math.max(
    toNumber(obj.score),
    toNumber(obj.risk),
    toNumber(obj.profilingRisk),
    toNumber(obj.manipulationRisk),
    0,
    ...categories.map((entry) => entry.score)
  )

  return {
    risk: Math.round(clamp(score, 0, 100)),
    categories,
    reason: typeof obj.reason === "string" ? obj.reason : undefined,
    source: typeof obj.source === "string" ? obj.source : undefined,
    modelId: typeof obj.modelId === "string" ? obj.modelId : undefined
  }
}

export function fuseLlmOutput(
  heuristic: AiDeepDiveRiskResult,
  parsed: ParsedLlmRisk,
  model: AiDeepDiveModelOption
): AiDeepDiveRiskResult {
  const llmCategories: AiDeepDiveCategoryScore[] = parsed.categories
    .filter((entry) => entry.score >= CATEGORY_MIN_SCORE)
    .map((entry) => ({
      category: entry.category,
      score: Math.round(entry.score),
      confidence: clamp(entry.score / 100, 0, 1),
      evidenceTags: [`llm_${entry.category}`]
    }))

  const llmMax = Math.max(
    parsed.risk,
    0,
    ...llmCategories.map((entry) => entry.score)
  )
  const score = Math.max(heuristic.score, llmMax)
  const mergedCategories = mergeCategories(heuristic.categories, llmCategories)

  return {
    ...heuristic,
    level: levelForScore(score),
    score,
    confidence: clamp(Math.max(heuristic.confidence, llmMax / 100), 0, 1),
    categories: mergedCategories,
    evidenceTags: Array.from(
      new Set([
        ...heuristic.evidenceTags,
        ...llmCategories.flatMap((entry) => entry.evidenceTags)
      ])
    ).slice(0, 10),
    model: {
      mode: "heuristic+llm-json",
      id: model.modelId,
      localOnly: true
    },
    rawTextRetained: false
  }
}

async function getGenerator(
  model: AiDeepDiveModelOption
): Promise<TextGeneratorRuntime> {
  const dtypes = await resolveWebGpuDtypes(model)
  const failures: string[] = []

  for (const dtype of dtypes) {
    const cacheKey = generatorCacheKey(model, "webgpu", dtype)
    const cachedFailure = generatorLoadFailures.get(cacheKey)
    if (cachedFailure) {
      failures.push(`${dtype}: ${cachedFailure.message}`)
      continue
    }

    const cached = generatorPromises.get(cacheKey)
    if (cached) return cached

    const promise = loadGeneratorForDtype(model, dtype).catch((error) => {
      generatorPromises.delete(cacheKey)
      const err = error instanceof Error ? error : new Error(String(error))
      generatorLoadFailures.set(cacheKey, err)
      throw err
    })
    generatorPromises.set(cacheKey, promise)

    try {
      return await promise
    } catch (error) {
      failures.push(
        `${dtype}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  throw new Error(
    `${model.id} nie załadował LLM pipeline na WebGPU. Próbowane dtype: ${dtypes.join(", ")}. ${failures.join(" | ")}`
  )
}

async function loadGeneratorForDtype(
  model: AiDeepDiveModelOption,
  dtype: string
): Promise<TextGeneratorRuntime> {
  const generator = await loadGenerator(model, dtype)
  return {
    generator,
    device: "webgpu",
    dtype
  }
}

async function loadGenerator(
  model: AiDeepDiveModelOption,
  dtype: string
): Promise<TextGenerator> {
  const transformers = (await import(
    "@huggingface/transformers"
  )) as TransformersModule
  configureTransformersRuntime(transformers)

  // Generative models are not a sane WASM demo path. Granite can stall for
  // minutes there, and Gemma is effectively unusable. Keep NLI on WASM, but run
  // LLM-JSON through WebGPU so the browser uses the ONNX WebGPU/JSEP runtime.
  const pipeline = (transformers as unknown as { pipeline: PipelineFn }).pipeline
  configureBundledModelRuntime(transformers)
  const runtimeModelId = getRuntimeModelId(model)
  const usesBundledModel = Boolean(model.localModelId)
  if (!usesBundledModel) setRemoteModelDownloadsEnabled(transformers, true)
  let generator: unknown
  try {
    generator = await pipeline("text-generation", runtimeModelId, {
      device: requireWebGpu(model),
      dtype,
      progress_callback: createModelProgressLogger(model)
    })
  } finally {
    if (!usesBundledModel) setRemoteModelDownloadsEnabled(transformers, false)
  }

  return generator as TextGenerator
}

function getRuntimeModelId(model: AiDeepDiveModelOption): string {
  return model.localModelId ?? model.modelId
}

function configureBundledModelRuntime(transformers: TransformersModule): void {
  const env = (transformers as unknown as {
    env?: {
      allowLocalModels?: boolean
      localModelPath?: string
      useBrowserCache?: boolean
    }
  }).env
  if (!env) return
  env.allowLocalModels = true
  env.localModelPath = resolveExtensionAssetUrl("assets/models/")
  env.useBrowserCache = false
}

function setRemoteModelDownloadsEnabled(
  transformers: TransformersModule,
  enabled: boolean
): void {
  const env = (transformers as unknown as {
    env?: {
      allowRemoteModels?: boolean
      useBrowserCache?: boolean
    }
  }).env
  if (!env) return
  env.allowRemoteModels = Boolean(enabled)
  env.useBrowserCache = true
}

function resolveExtensionAssetUrl(path: string): string {
  const maybeChrome = (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: { getURL?: (path: string) => string } }
    }
  ).chrome

  return maybeChrome?.runtime?.getURL?.(path) ?? path
}

async function resolveWebGpuDtypes(
  model: AiDeepDiveModelOption
): Promise<string[]> {
  const transformers = (await import(
    "@huggingface/transformers"
  )) as TransformersModule
  const registry = (transformers as unknown as { ModelRegistry?: ModelRegistryLike })
    .ModelRegistry
  const preferred = orderWebGpuDtypeCandidatesForModel(model)

  try {
    configureBundledModelRuntime(transformers)
    const available = await registry?.get_available_dtypes?.(getRuntimeModelId(model))
    const matches = selectAvailableDtypes(preferred, available)
    if (matches.length > 0) return matches
  } catch {
    // Dtype probing is a diagnostic aid; loading with the configured dtype is
    // still the correct next move when metadata probing fails.
  }

  return preferred
}

function requireWebGpu(model: AiDeepDiveModelOption): "webgpu" {
  const gpu = (
    globalThis.navigator as
      | (Navigator & { gpu?: unknown })
      | undefined
  )?.gpu
  if (!gpu) {
    throw new Error(
      `${model.label} wymaga WebGPU w tej wersji. WASM fallback jest zbyt wolny dla LLM-JSON.`
    )
  }
  return "webgpu"
}

function createModelProgressLogger(
  model: AiDeepDiveModelOption
): (info: Record<string, unknown>) => void {
  let lastLine = ""
  return (info) => {
    const status = String(info.status ?? "progress")
    const file = String(info.file ?? info.name ?? "")
    const progress =
      typeof info.progress === "number"
        ? ` ${Math.round(info.progress)}%`
        : ""
    const line = `[cnd:model] ${model.id} ${status}${progress} ${file}`.trim()
    if (line === lastLine) return
    lastLine = line
    console.debug(line)
  }
}

export function orderWebGpuDtypeCandidates(
  preferredDtype: string
): string[] {
  return unique([preferredDtype, "fp16", "q4", "q4f16"].filter(Boolean))
}

function orderWebGpuDtypeCandidatesForModel(
  model: AiDeepDiveModelOption
): string[] {
  if (model.id.startsWith("gemma-4-e2b")) return [model.dtypeWebgpu]
  return orderWebGpuDtypeCandidates(model.dtypeWebgpu)
}

function selectAvailableDtypes(
  preferred: string[],
  available: string[] | undefined
): string[] {
  if (!Array.isArray(available) || available.length === 0) return preferred
  return preferred.filter((dtype) => available.includes(dtype))
}

function generatorCacheKey(
  model: AiDeepDiveModelOption,
  device: "webgpu",
  dtype: string
): string {
  return `${getRuntimeModelId(model)}::${device}::${dtype}`
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : (value as number)
  return Number.isFinite(parsed) ? parsed : 0
}

function extractFirstJsonObject(text: string): string | null {
  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim()
  const start = cleaned.indexOf("{")
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === "\\") {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === "{") depth++
    if (ch === "}") {
      depth--
      if (depth === 0) return cleaned.slice(start, i + 1)
    }
  }
  return null
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}
