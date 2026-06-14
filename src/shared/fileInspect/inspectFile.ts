// src/shared/fileInspect/inspectFile.ts
// Pure-agregator Stage-1: spina trzy inspektory (magic, pdf, container) w jeden
// werdykt strukturalny. Zero sieci, zero DOM — bajty dostarczone lokalnie.
// NIE antywirus: wynik mówi „ta struktura jest niebezpieczna/podejrzana", nie
// „to znana rodzina malware".

import { clamp } from "../aiDeepDive/normalize"
import { inspectContainer } from "./containerInspect"
import { inspectMagic } from "./magicBytes"
import { inspectPdf } from "./pdfInspect"
import type { FileRiskLevel, FileSignal } from "./types"

export interface FileInspectVerdict {
  filename: string
  sizeBytes: number
  score: number
  level: FileRiskLevel
  signals: FileSignal[]
  detectedType: string | null
  declaredExtension: string
  /** Krótkie podsumowanie po polsku. */
  summary: string
}

const LEVELS = { low: 25, medium: 55, high: 80 } as const

function levelForScore(score: number): FileRiskLevel {
  if (score >= LEVELS.high) return "critical"
  if (score >= LEVELS.medium) return "high"
  if (score >= LEVELS.low) return "medium"
  return "low"
}

export function inspectFileBytes(
  filename: string,
  bytes: Uint8Array
): FileInspectVerdict {
  const magic = inspectMagic(bytes, filename)
  const pdf = inspectPdf(bytes)
  const container = inspectContainer(bytes)

  const signals: FileSignal[] = [
    ...magic.signals,
    ...pdf.signals,
    ...container.signals
  ].sort((a, b) => b.weight - a.weight)

  const score = clamp(
    Math.round(signals.reduce((sum, s) => sum + s.weight, 0)),
    0,
    100
  )
  const level = levelForScore(score)

  return {
    filename,
    sizeBytes: bytes.byteLength,
    score,
    level,
    signals,
    detectedType: magic.detectedType,
    declaredExtension: magic.declaredExtension,
    summary: buildSummary(level, signals, magic.detectedType)
  }
}

function buildSummary(
  level: FileRiskLevel,
  signals: FileSignal[],
  detectedType: string | null
): string {
  if (signals.length === 0) {
    const t = detectedType ? `typ: ${detectedType}` : "typ nierozpoznany"
    return `Brak niebezpiecznej struktury (${t}).`
  }
  const prefix =
    level === "critical" || level === "high"
      ? "Plik niebezpieczny strukturalnie"
      : "Plik wymaga ostrożności"
  return `${prefix}: ${signals[0].reason}`
}
