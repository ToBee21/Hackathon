// src/shared/mailGuard/moClassifier.ts
// Klasyfikator Modus Operandi — wybiera jeden archetyp ataku na podstawie
// gotowych werdyktów (nadawca, załączniki) oraz treści i domen linków.
// Czysta logika: zero I/O, zero DOM, zero sieci. Deterministyczne, polskie tells.

import type {
  AttachmentVerdict,
  MoArchetype,
  MoInput,
  MoVerdict
} from "./types"

// Wzorce językowe (treść jest analizowana na lowercase'owanej kopii).
const RE_BEC_TOPIC =
  /numer(u)? konta|rachunk|iban|przelew|faktur|payment|invoice|wire transfer|bank details|zmian[aey].*(konta|rachunku)/
const RE_URGENCY =
  /piln[aey]|natychmiast|jak najszybciej|dzisiaj|do ko[ńn]ca dnia|urgent|asap|immediately|as soon as possible|termin|zaleg[łl]|ostateczn/
const RE_CRED =
  /zweryfikuj|zaloguj|potwierd[źz]|verify|log ?in|sign ?in|account.*(suspend|lock|verif)|konto.*(zablokowan|zawieszon|weryfik)/
const RE_PHONE = /(\+?\d[\d\s().-]{7,}\d)/
const RE_CALL =
  /zadzwo[ńn]|skontaktuj|call|po[łl][ąa]cz si[ęe]|phone|telefon(icznie)?/

const MALWARE_ARCHETYPES = new Set([
  "macro",
  "double-extension",
  "smuggling",
  "executable"
])

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/** Skala pewności: baza 0.4 + 0.2 za każdy dodatkowy (korroborujący) sygnał, cap 0.95. */
function scaleConfidence(tellCount: number): number {
  if (tellCount <= 0) return 0.2
  return clamp01(Math.min(0.95, 0.4 + 0.2 * (tellCount - 1)))
}

interface Candidate {
  archetype: MoArchetype
  tells: string[]
}

export function classifyMo(input: MoInput): MoVerdict {
  const { senderVerdict, attachmentVerdicts, bodyText, linkDomains } = input
  const body = (bodyText || "").toLowerCase()

  const candidates: Candidate[] = []

  // -------------------------------------------------------------------------
  // MALWARE-DELIVERY
  // -------------------------------------------------------------------------
  {
    const tells: string[] = []
    const dangerous: AttachmentVerdict[] = (attachmentVerdicts || []).filter(
      (a) => a && MALWARE_ARCHETYPES.has(a.archetype)
    )
    const passwordedArchive = (attachmentVerdicts || []).some(
      (a) =>
        a &&
        a.archetype === "archive" &&
        /has[łl]o|password|pass:|pin do|kod do archiwum/.test(body)
    )

    if (dangerous.length > 0) {
      for (const a of dangerous) {
        switch (a.archetype) {
          case "macro":
            tells.push("Załącznik z makrami (dokument Office)")
            break
          case "double-extension":
            tells.push("Załącznik z podwójnym rozszerzeniem (np. .pdf.exe)")
            break
          case "smuggling":
            tells.push("Załącznik typu smuggling (html/iso/img/lnk)")
            break
          case "executable":
            tells.push("Załącznik wykonywalny (exe/scr/bat/js/vbs)")
            break
        }
      }
    }
    if (passwordedArchive) {
      tells.push("Archiwum z hasłem podanym w treści (omijanie skanera)")
    }

    if (tells.length > 0) {
      candidates.push({ archetype: "malware-delivery", tells })
    }
  }

  // -------------------------------------------------------------------------
  // BEC (oszustwo na przelew)
  // -------------------------------------------------------------------------
  {
    const tells: string[] = []
    const senderTrigger =
      senderVerdict?.replyToMismatch || !!senderVerdict?.lookalikeBrand
    const topic = RE_BEC_TOPIC.test(body)

    if (senderTrigger && topic) {
      if (senderVerdict.replyToMismatch) {
        tells.push("Reply-To prowadzi do innej domeny niż nadawca")
      }
      if (senderVerdict.lookalikeBrand) {
        tells.push(
          `Nadawca podszywa się pod markę: ${senderVerdict.lookalikeBrand}`
        )
      }
      tells.push("Treść dotyczy płatności / zmiany numeru konta")
      if (RE_URGENCY.test(body)) {
        tells.push("Wymuszanie pilności (presja czasu)")
      }
      candidates.push({ archetype: "bec", tells })
    }
  }

  // -------------------------------------------------------------------------
  // CREDENTIAL-PHISHING
  // -------------------------------------------------------------------------
  {
    const tells: string[] = []
    const senderDomain = senderVerdict?.senderDomain || ""
    const foreignLink = (linkDomains || []).find(
      (d) => d && d !== senderDomain
    )
    const credLang = RE_CRED.test(body)

    if (foreignLink && credLang) {
      tells.push(
        `Link prowadzi do obcej domeny (${foreignLink}) innej niż nadawca`
      )
      tells.push("Treść namawia do weryfikacji / logowania")
      if (senderVerdict?.lookalikeBrand) {
        tells.push(
          `Podszycie pod markę wzmacnia phishing: ${senderVerdict.lookalikeBrand}`
        )
      }
      candidates.push({ archetype: "credential-phishing", tells })
    }
  }

  // -------------------------------------------------------------------------
  // CALLBACK-SCAM (TOAD)
  // -------------------------------------------------------------------------
  {
    const tells: string[] = []
    const hasPhone = RE_PHONE.test(body)
    const callLang = RE_CALL.test(body)
    const noLinks = (linkDomains || []).length === 0
    const noDangerousAttachments = !(attachmentVerdicts || []).some(
      (a) =>
        a &&
        (MALWARE_ARCHETYPES.has(a.archetype) || a.archetype === "archive")
    )

    if (hasPhone && callLang && noLinks && noDangerousAttachments) {
      tells.push("Treść zawiera numer telefonu do oddzwonienia")
      tells.push("Wezwanie do kontaktu telefonicznego (zadzwoń/skontaktuj się)")
      tells.push("Brak linków i groźnych załączników (klasyczny TOAD)")
      candidates.push({ archetype: "callback-scam", tells })
    }
  }

  // -------------------------------------------------------------------------
  // Wybór zwycięzcy: najwyższy wynik (liczba tells), remisy wg precedencji
  // malware-delivery > bec > credential-phishing > callback-scam.
  // -------------------------------------------------------------------------
  if (candidates.length === 0) {
    return {
      archetype: "unknown",
      confidence: 0.2,
      tells: ["Brak wyraźnego wzorca ataku."]
    }
  }

  const precedence: Record<string, number> = {
    "malware-delivery": 4,
    bec: 3,
    "credential-phishing": 2,
    "callback-scam": 1,
    unknown: 0
  }

  let best = candidates[0]
  for (const c of candidates.slice(1)) {
    if (c.tells.length > best.tells.length) {
      best = c
    } else if (c.tells.length === best.tells.length) {
      if (precedence[c.archetype] > precedence[best.archetype]) {
        best = c
      }
    }
  }

  return {
    archetype: best.archetype,
    confidence: scaleConfidence(best.tells.length),
    tells: best.tells.slice(0, 5)
  }
}
