import type { AiDeepDiveRiskResult } from "./types"

export function shouldSendAiDeepDiveReport(
  _result: AiDeepDiveRiskResult
): boolean {
  return true
}

export function shouldShowAiDeepDiveNotification(
  result: AiDeepDiveRiskResult
): boolean {
  return result.level === "high" || result.level === "critical"
}

export function shouldLogAiDeepDiveReport(result: AiDeepDiveRiskResult): boolean {
  return result.level !== "low"
}
