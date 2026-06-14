import { classifyHeuristic } from "../../shared/aiDeepDive/score"
import {
  DEFAULT_AI_DEEP_DIVE_CONFIG,
  STORAGE_KEY_AI_DEEP_DIVE_CONFIG,
  normalizeAiDeepDiveConfig
} from "../../shared/aiDeepDive/config"
import { shouldRunModel } from "../../shared/aiDeepDive/gate"
import { requestDeepScan } from "../deepScanClient"
import {
  shouldSendAiDeepDiveReport,
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

    if (!shouldEmit(heuristic)) return

    // Szybka ścieżka: raport i powiadomienie idą OD RAZU z heurystyki — toast nie
    // czeka na (opcjonalny) ciężki model, więc pojawia się niemal natychmiast.
    if (shouldSendAiDeepDiveReport(heuristic)) {
      sendRuntimeMessage(heuristic)
    }
    if (shouldShowAiDeepDiveNotification(heuristic)) {
      showAiDeepDiveToast(heuristic)
    }

    // Doprecyzowanie: gdy tryb AI jest włączony, dolicz model i odśwież raport
    // (dashboard). Toast pokazujemy ponownie tylko, jeśli model PODNIÓSŁ ryzyko
    // z poziomu „cichego" do progu powiadomienia — bez dublowania alertu.
    const config = await loadAiDeepDiveConfig()
    if (shouldRunModel(heuristic, config)) {
      const deep = await requestDeepScan(input, config, crypto.randomUUID())
      if (deep.result && shouldSendAiDeepDiveReport(deep.result)) {
        sendRuntimeMessage(deep.result)
        if (
          !shouldShowAiDeepDiveNotification(heuristic) &&
          shouldShowAiDeepDiveNotification(deep.result)
        ) {
          showAiDeepDiveToast(deep.result)
        }
      }
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
