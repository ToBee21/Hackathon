// src/content/deepScanClient.ts
// Content-side client for the heavy local model. Sends the work to the service
// worker, which runs it in an OFFSCREEN document — NOT in the content script.
// Why: a content script's dynamic import() of @huggingface/transformers resolves
// its async chunk against the host PAGE origin and fails ("Cannot find module
// '<chunk>'"). The offscreen document is an extension-origin page where chunk
// loading + WASM/WebGPU work correctly. This module pulls in NO model code, so
// the content-script bundle stays free of the transformers chunk.

import type { AiDeepDiveRuntimeConfig } from "../shared/aiDeepDive/config"
import type { AiDeepDiveInput, AiDeepDiveRiskResult } from "../shared/aiDeepDive/types"
import type { DeepScanResponse } from "../shared/messages"

const ext = globalThis.chrome

export function requestDeepScan(
  input: AiDeepDiveInput,
  config: AiDeepDiveRuntimeConfig,
  requestId: string
): Promise<{ result: AiDeepDiveRiskResult | null; error?: string }> {
  return new Promise((resolve) => {
    if (!ext?.runtime?.sendMessage) {
      resolve({ result: null, error: "runtime unavailable" })
      return
    }
    try {
      ext.runtime.sendMessage(
        { type: "CND_DEEP_SCAN", requestId, input, config },
        (res: DeepScanResponse | undefined) => {
          if (ext.runtime.lastError) {
            resolve({ result: null, error: ext.runtime.lastError.message })
            return
          }
          if (!res?.ok || !res.result) {
            resolve({ result: null, error: res?.error ?? "no result" })
            return
          }
          resolve({ result: res.result })
        }
      )
    } catch (err) {
      resolve({ result: null, error: err instanceof Error ? err.message : String(err) })
    }
  })
}
