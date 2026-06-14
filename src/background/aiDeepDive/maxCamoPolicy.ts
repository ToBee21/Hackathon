import type { AiDeepDiveRiskResult } from "../../shared/aiDeepDive/types"

export function deriveMaxCamoPatch(result: AiDeepDiveRiskResult) {
  if (result.level !== "high" && result.level !== "critical") {
    return null
  }

  return {
    toggles: {
      dataGhost: true,
      mouseJitter: true,
      keystroke: true
    },
    bionicBlur: {
      isEnabled: true,
      mouseEnabled: true,
      keyboardEnabled: true,
      fingerprintEnabled: true,
      browserGuardEnabled: true,
      mouseIntensity: result.level === "critical" ? 6 : 4,
      timestampJitterMs: result.level === "critical" ? 28 : 18
    },
    dataGhostBatchSize: result.level === "critical" ? 5 : 3
  } as const
}

