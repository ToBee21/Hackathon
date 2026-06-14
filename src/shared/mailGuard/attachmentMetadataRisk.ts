// src/shared/mailGuard/attachmentMetadataRisk.ts
// STAGE 0 — analiza WYŁĄCZNIE metadanych załącznika (nazwa pliku + MIME + rozmiar).
// Plik wciąż leży w chmurze providera — NIE mamy bajtów, NIE pobieramy, NIE skanujemy.
// Cała logika jest lokalna, deterministyczna, a powody są po polsku (lądują wprost w UI).

import type {
  AttachmentArchetype,
  AttachmentInput,
  AttachmentVerdict,
  MailSignal
} from "./types"

/** Rozszerzenia wykonywalne — "ostateczny" niebezpieczny token. */
const DANGEROUS_EXECUTABLE = new Set([
  "exe",
  "scr",
  "bat",
  "cmd",
  "com",
  "pif",
  "js",
  "jse",
  "vbs",
  "vbe",
  "ws",
  "wsf",
  "hta",
  "msi",
  "ps1",
  "lnk"
])

/** Dokumenty Office z obsługą makr. */
const MACRO_EXTENSIONS = new Set(["docm", "xlsm", "pptm", "dotm", "xltm"])

/** Przemyt / obejście zabezpieczeń (HTML smuggling, MOTW/SmartScreen). */
const SMUGGLING_EXTENSIONS = new Set(["html", "htm", "iso", "img", "vhd", "lnk", "svg"])

/** Kontenery archiwum — często z hasłem, by ominąć skanery. */
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "gz", "tar", "ace", "cab"])

/** Rodzina MIME oczekiwana dla typowych "bezpiecznych" rozszerzeń. */
const MIME_FAMILY: Record<string, RegExp> = {
  pdf: /application\/pdf/,
  doc: /application\/msword|officedocument\.wordprocessingml/,
  docx: /officedocument\.wordprocessingml/,
  xls: /application\/vnd\.ms-excel|officedocument\.spreadsheetml/,
  xlsx: /officedocument\.spreadsheetml/,
  ppt: /application\/vnd\.ms-powerpoint|officedocument\.presentationml/,
  pptx: /officedocument\.presentationml/,
  txt: /text\/plain/,
  csv: /text\/csv|text\/plain/,
  png: /image\/png/,
  jpg: /image\/jpe?g/,
  jpeg: /image\/jpe?g/,
  gif: /image\/gif/
}

/** Powiedzonko o haśle w treści maila (omija skanery AV). */
const PASSWORD_TELL = /has[łl]o|password|pass:|pin|kod do/

/** Priorytet archetypu — wyższa liczba wygrywa przy kolizji. */
const ARCHETYPE_PRIORITY: Record<AttachmentArchetype, number> = {
  "double-extension": 5,
  executable: 4,
  macro: 3,
  smuggling: 2,
  archive: 1,
  none: 0
}

function pickArchetype(
  current: AttachmentArchetype,
  candidate: AttachmentArchetype
): AttachmentArchetype {
  return ARCHETYPE_PRIORITY[candidate] > ARCHETYPE_PRIORITY[current]
    ? candidate
    : current
}

export function analyzeAttachment(
  input: AttachmentInput,
  bodyText?: string
): AttachmentVerdict {
  const signals: MailSignal[] = []
  let archetype: AttachmentArchetype = "none"

  // 1) Normalizacja nazwy pliku i wyłuskanie tokenów rozszerzeń.
  const normalized = (input.filename || "").trim().toLowerCase()
  const tokens = normalized.split(".")
  // Tokeny rozszerzeń to wszystko po pierwszej kropce (część przed = "trzon" nazwy).
  const extTokens = tokens.length > 1 ? tokens.slice(1) : []
  const effectiveExtension = extTokens.length > 0 ? extTokens[extTokens.length - 1] : ""

  const mime = (input.mime || "").trim().toLowerCase()

  // 2) DOUBLE EXTENSION — np. "faktura.pdf.exe", "cv.docx.scr".
  // Co najmniej dwa końcowe tokeny wyglądające na rozszerzenia, a niegroźny
  // poprzedza groźny ostateczny.
  if (extTokens.length >= 2) {
    const finalToken = extTokens[extTokens.length - 1]
    const precedingToken = extTokens[extTokens.length - 2]
    const precedingLooksExt = /^[a-z0-9]{1,5}$/.test(precedingToken)
    const precedingIsDangerous = DANGEROUS_EXECUTABLE.has(precedingToken)

    if (
      DANGEROUS_EXECUTABLE.has(finalToken) &&
      precedingLooksExt &&
      !precedingIsDangerous
    ) {
      archetype = pickArchetype(archetype, "double-extension")
      signals.push({
        id: "att.double-extension",
        weight: 70,
        reason: `Podwójne rozszerzenie — plik udaje ".${precedingToken}", a faktycznie jest wykonywalny ".${finalToken}". Klasyczne ukrycie malware.`
      })
    }
  }

  // 3) EXECUTABLE — pojedyncze, groźne rozszerzenie.
  if (
    archetype !== "double-extension" &&
    DANGEROUS_EXECUTABLE.has(effectiveExtension)
  ) {
    archetype = pickArchetype(archetype, "executable")
    signals.push({
      id: "att.executable",
      weight: 65,
      reason: `Plik wykonywalny ".${effectiveExtension}" — uruchomienie z załącznika to bezpośrednie ryzyko infekcji.`
    })
  }

  // 4) MACRO — dokument Office z makrami.
  if (MACRO_EXTENSIONS.has(effectiveExtension)) {
    archetype = pickArchetype(archetype, "macro")
    signals.push({
      id: "att.macro",
      weight: 55,
      reason: `Dokument Office z makrami ".${effectiveExtension}" — makra mogą wykonać złośliwy kod po włączeniu.`
    })
  }

  // 5) SMUGGLING — html/svg (HTML smuggling) oraz iso/img/vhd/lnk (MOTW/SmartScreen).
  if (SMUGGLING_EXTENSIONS.has(effectiveExtension)) {
    archetype = pickArchetype(archetype, "smuggling")
    let reason: string
    if (effectiveExtension === "html" || effectiveExtension === "htm" || effectiveExtension === "svg") {
      reason = `Plik ".${effectiveExtension}" — HTML smuggling: złośliwy ładunek montowany lokalnie w przeglądarce, omija filtry treści.`
    } else if (
      effectiveExtension === "iso" ||
      effectiveExtension === "img" ||
      effectiveExtension === "vhd"
    ) {
      reason = `Obraz dysku ".${effectiveExtension}" — montowany lokalnie, obchodzi SmartScreen/MOTW (Mark-of-the-Web).`
    } else {
      reason = `Plik ".${effectiveExtension}" — częsty nośnik przemytu ładunku, obchodzi SmartScreen/MOTW.`
    }
    signals.push({
      id: "att.smuggling",
      weight: 50,
      reason
    })
  }

  // 6) ARCHIVE — kontener; sam w sobie umiarkowany, ale "hasło w treści" podbija ryzyko.
  if (ARCHIVE_EXTENSIONS.has(effectiveExtension)) {
    archetype = pickArchetype(archetype, "archive")
    signals.push({
      id: "att.archive",
      weight: 30,
      reason: `Archiwum ".${effectiveExtension}" — zawartość niewidoczna na etapie metadanych, wymaga rozpakowania.`
    })

    const body = (bodyText || "").toLowerCase()
    if (PASSWORD_TELL.test(body)) {
      // Hasło w treści maila — szyfrowane archiwum omija skanery AV.
      archetype = pickArchetype(archetype, "archive")
      signals.push({
        id: "att.archive-password",
        weight: 35,
        reason: "Archiwum + hasło w treści — zaszyfrowana zawartość omija skanery antywirusowe (klasyczny chwyt malware)."
      })
    }
  }

  // 7) MIME mismatch — rozszerzenie deklaruje niegroźny typ, a MIME zdradza coś innego.
  if (mime && effectiveExtension && MIME_FAMILY[effectiveExtension]) {
    if (!MIME_FAMILY[effectiveExtension].test(mime)) {
      signals.push({
        id: "att.mime-mismatch",
        weight: 40,
        reason: `Niespójność MIME — rozszerzenie ".${effectiveExtension}" sugeruje inny typ niż zadeklarowany MIME "${mime}". Możliwe maskowanie pliku.`
      })
    }
  }

  // Sortowanie sygnałów malejąco po wadze (najgroźniejsze na górze listy w UI).
  signals.sort((a, b) => b.weight - a.weight)

  return {
    signals,
    archetype,
    effectiveExtension
  }
}
