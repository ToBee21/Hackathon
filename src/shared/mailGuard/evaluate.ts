// src/shared/mailGuard/evaluate.ts
// Pure-agregator MailGuarda: spina cztery moduły logiki (sender, attachment, MO,
// campaign fingerprint) w jeden werdykt. Zero DOM/sieci — wejściem jest dowód
// (MailEvidence) wyłuskany wcześniej z wyrenderowanego DOM webmaila.
//
// `now` wstrzykiwane z zewnątrz, by całość była deterministyczna i testowalna.

import { clamp } from "../aiDeepDive/normalize"
import { analyzeAttachment } from "./attachmentMetadataRisk"
import {
  computeCampaignFingerprint,
  isRepeatOffender,
  recordCampaign
} from "./campaignFingerprint"
import { classifyMo } from "./moClassifier"
import { analyzeSender } from "./senderHeuristics"
import type {
  AttachmentInput,
  AttachmentVerdict,
  MailRiskLevel,
  MailSignal,
  MoArchetype,
  SenderInput
} from "./types"

export interface MailEvidence {
  sender: SenderInput
  attachments: AttachmentInput[]
  bodyText: string
  /** Domeny rejestrowalne linków z treści. */
  linkDomains: string[]
}

export interface MailGuardVerdict {
  score: number
  level: MailRiskLevel
  signals: MailSignal[]
  archetype: MoArchetype
  confidence: number
  tells: string[]
  lookalikeBrand: string | null
  senderDomain: string
  fingerprint: string
  repeatOffender: boolean
  seenCount: number
}

const LEVELS = { low: 25, medium: 55, high: 80 } as const

const MO_LABEL: Record<MoArchetype, string> = {
  bec: "Oszustwo na przelew (BEC)",
  "malware-delivery": "Dostawa malware",
  "credential-phishing": "Wyłudzenie poświadczeń",
  "callback-scam": "Scam telefoniczny (TOAD)",
  unknown: "Brak wyraźnego wzorca"
}

export function moArchetypeLabel(archetype: MoArchetype): string {
  return MO_LABEL[archetype]
}

function levelForScore(score: number): MailRiskLevel {
  if (score >= LEVELS.high) return "critical"
  if (score >= LEVELS.medium) return "high"
  if (score >= LEVELS.low) return "medium"
  return "low"
}

function firstAttachmentArchetype(verdicts: AttachmentVerdict[]): string {
  const hit = verdicts.find((v) => v.archetype !== "none")
  return hit ? hit.archetype : "none"
}

export function evaluateMail(ev: MailEvidence, now: number): MailGuardVerdict {
  const senderV = analyzeSender(ev.sender)
  const attV = (ev.attachments ?? []).map((a: AttachmentInput) =>
    analyzeAttachment(a, ev.bodyText)
  )
  const mo = classifyMo({
    senderVerdict: senderV,
    attachmentVerdicts: attV,
    bodyText: ev.bodyText ?? "",
    linkDomains: ev.linkDomains ?? []
  })

  const signals: MailSignal[] = [
    ...senderV.signals,
    ...attV.flatMap((a) => a.signals)
  ]

  // Campaign fingerprint — stabilny, anonimowy odcisk wzorca ataku.
  const fingerprint = computeCampaignFingerprint({
    senderDomainPattern: senderV.senderDomain,
    targetBrand: senderV.lookalikeBrand,
    linkDomainPattern: ev.linkDomains?.[0] ?? null,
    attachmentArchetype: firstAttachmentArchetype(attV),
    moArchetype: mo.archetype
  })
  const record = recordCampaign(fingerprint, now)
  const repeatOffender = isRepeatOffender(fingerprint)

  if (repeatOffender) {
    signals.push({
      id: "repeat-offender",
      weight: 22,
      reason: `Ten sam wzorzec ataku widziany ${record.count}x wcześniej w tej sesji.`
    })
  }

  const sorted = [...signals].sort((a, b) => b.weight - a.weight)
  // Wynik: suma wag sygnałów, podbity podłogą wynikającą z pewności archetypu MO
  // (gdy MO jest jednoznaczne, nie chcemy zaniżać tylko dlatego, że mało sygnałów).
  const weightScore = sorted.reduce((sum, s) => sum + s.weight, 0)
  const moFloor =
    mo.archetype === "unknown" ? 0 : Math.round(mo.confidence * 70)
  const score = clamp(Math.round(Math.max(weightScore, moFloor)), 0, 100)

  return {
    score,
    level: levelForScore(score),
    signals: sorted,
    archetype: mo.archetype,
    confidence: mo.confidence,
    tells: mo.tells,
    lookalikeBrand: senderV.lookalikeBrand,
    senderDomain: senderV.senderDomain,
    fingerprint,
    repeatOffender,
    seenCount: record.count
  }
}
