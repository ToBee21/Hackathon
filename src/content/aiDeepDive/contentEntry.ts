import { classifyHeuristic } from "../../shared/aiDeepDive/score"
import {
  DEFAULT_AI_DEEP_DIVE_CONFIG,
  STORAGE_KEY_AI_DEEP_DIVE_CONFIG,
  normalizeAiDeepDiveConfig
} from "../../shared/aiDeepDive/config"
import { shouldRunModel } from "../../shared/aiDeepDive/gate"
import { requestDeepScan } from "../deepScanClient"
import {
  shouldShowAiDeepDiveNotification
} from "../../shared/aiDeepDive/reportPolicy"
import type { AiDeepDiveRiskResult } from "../../shared/aiDeepDive/types"
import { extractVisibleTextFromPage } from "./extractVisibleText"
import { showAiDeepDiveToast } from "./pageAlert"
import { startAiDeepDiveScanScheduler } from "./scanScheduler"

const DETECTION_COOLDOWN_MS = 30_000

let lastSignature = ""
let lastSentAt = 0

export function initializeAiDeepDiveContent(
  sendRuntimeMessage: (message: unknown) => void
): void {
  if (window.top !== window) return

  startAiDeepDiveScanScheduler(() => {
    void runAiDeepDiveScan(sendRuntimeMessage)
  })
}

async function runAiDeepDiveScan(
  sendRuntimeMessage: (message: unknown) => void
): Promise<void> {
  try {
    const input = extractVisibleTextFromPage()
    const heuristic = classifyHeuristic(input)
    const config = await loadAiDeepDiveConfig()
    let result = heuristic
    if (shouldRunModel(heuristic, config)) {
      const deep = await requestDeepScan(input, config, crypto.randomUUID())
      if (deep.result) result = deep.result
    }

    if (!shouldEmit(result)) return

    // This is an internal extension message carrying only the compact verdict.
    // `shouldSendAiDeepDiveReport` intentionally denies page/report emission by
    // default, but it must not suppress the local dashboard + MaxCamo state path.
    sendRuntimeMessage(result)
    if (shouldShowAiDeepDiveNotification(result)) {
      showAiDeepDiveToast(result)
    }
  } catch {
    // The scanner must never break the page or the Bionic bridge.
  }
}

function shouldEmit(result: AiDeepDiveRiskResult): boolean {
  const signature = [
    result.origin,
    result.urlHash,
    result.level,
    result.evidenceTags.join("|")
  ].join(":")
  const now = Date.now()

  if (signature === lastSignature && now - lastSentAt < DETECTION_COOLDOWN_MS) {
    return false
  }

  lastSignature = signature
  lastSentAt = now
  return true
}

async function loadAiDeepDiveConfig() {
  const ext = globalThis.chrome
  if (!ext?.storage?.local) return DEFAULT_AI_DEEP_DIVE_CONFIG

  return new Promise<typeof DEFAULT_AI_DEEP_DIVE_CONFIG>((resolve) => {
    try {
      ext.storage.local.get(STORAGE_KEY_AI_DEEP_DIVE_CONFIG, (stored) => {
        resolve(
          normalizeAiDeepDiveConfig(
            stored?.[STORAGE_KEY_AI_DEEP_DIVE_CONFIG] as
              | Partial<typeof DEFAULT_AI_DEEP_DIVE_CONFIG>
              | undefined
          )
        )
      })
    } catch {
      resolve(DEFAULT_AI_DEEP_DIVE_CONFIG)
    }
  })
}
