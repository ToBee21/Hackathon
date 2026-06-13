import { classifyHeuristic } from "../../shared/aiDeepDive/score"
import type { AiDeepDiveRiskResult } from "../../shared/aiDeepDive/types"
import { extractVisibleTextFromPage } from "./extractVisibleText"
import { showAiDeepDiveToast } from "./pageAlert"
import { startAiDeepDiveScanScheduler } from "./scanScheduler"

const MIN_SEND_SCORE = 25
const DETECTION_COOLDOWN_MS = 30_000

let lastSignature = ""
let lastSentAt = 0

export function initializeAiDeepDiveContent(
  sendRuntimeMessage: (message: unknown) => void
): void {
  if (window.top !== window) return

  startAiDeepDiveScanScheduler(() => {
    const result = classifyHeuristic(extractVisibleTextFromPage())
    if (result.score < MIN_SEND_SCORE) return
    if (!shouldEmit(result)) return

    sendRuntimeMessage(result)
    showAiDeepDiveToast(result)
  })
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

