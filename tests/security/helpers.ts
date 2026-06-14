import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { AiDeepDiveRiskResult } from "../../src/shared/aiDeepDive/types"

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = path.resolve(HERE, "../..")
export const BUILD_ROOT = path.join(REPO_ROOT, "build", "chrome-mv3-prod")

export function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

export function readJsonFile<T = unknown>(relativePath: string): T {
  return JSON.parse(readRepoFile(relativePath)) as T
}

export function readBuiltManifest(): {
  content_scripts?: Array<{ js?: string[] }>
  host_permissions?: string[]
  permissions?: string[]
  content_security_policy?: { extension_pages?: string }
  web_accessible_resources?: Array<{ resources?: string[]; matches?: string[] }>
} {
  return readJsonFile("build/chrome-mv3-prod/manifest.json")
}

export function readBuiltContentScript(): string {
  const manifest = readBuiltManifest()
  const relativePath = manifest.content_scripts?.[0]?.js?.[0]
  if (!relativePath) {
    throw new Error("Built manifest does not expose a content script path")
  }

  return fs.readFileSync(path.join(BUILD_ROOT, relativePath), "utf8")
}

export function readBuiltBackgroundScript(): string {
  return fs.readFileSync(
    path.join(BUILD_ROOT, "static", "background", "index.js"),
    "utf8"
  )
}

export function readBuiltOffscreenScript(): string {
  return fs.readFileSync(
    path.join(BUILD_ROOT, "assets", "offscreen", "offscreen.js"),
    "utf8"
  )
}

export function readBuiltTransformersAsset(): string {
  return fs.readFileSync(
    path.join(BUILD_ROOT, "assets", "vendor", "transformers.web.js"),
    "utf8"
  )
}

export function makeRiskResult(
  overrides: Partial<AiDeepDiveRiskResult> & { model?: any } = {}
): AiDeepDiveRiskResult {
  const defaultCategories: AiDeepDiveRiskResult["categories"] = [
    {
      category: "medical",
      score: 82,
      confidence: 0.81,
      evidenceTags: ["medical"]
    }
  ]

  const base: AiDeepDiveRiskResult = {
    type: "AI_DEEP_DIVE_RESULT",
    version: 1,
    level: "high",
    score: 82,
    confidence: 0.81,
    categories: defaultCategories,
    evidenceTags: ["medical"],
    origin: "https://example.test",
    urlHash: "deadbeef",
    timestamp: 1_700_000_000_000,
    model: {
      mode: "heuristic",
      localOnly: true
    },
    rawTextRetained: false
  }

  return {
    ...base,
    ...overrides,
    categories: overrides.categories ?? defaultCategories,
    evidenceTags: overrides.evidenceTags ?? ["medical"],
    rawTextRetained: false
  }
}
