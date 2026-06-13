// src/shared/honeypot.ts
// Moduł D+: "The Honeypot Trap" — Zatruwanie Profilera (Data Poisoning).
//
// Aktywna obrona prywatności: zamiast tylko blokować trackery, przechwytujemy
// ich żądania W LOCIE i nadpisujemy parametry profilujące absurdalnym,
// wewnętrznie sprzecznym szumem. Profiler dostaje dane — tyle że bezwartościowe
// i niszczące jakość zbudowanego profilu reklamowego.
//
// ── Architektura (Manifest V3, niezawodna dla środowiska dev/hackathon) ──
//   1. chrome.declarativeNetRequest (DNR) z DYNAMICZNYMI regułami:
//      action "redirect" + queryTransform.addOrReplaceParams nadpisuje parametry
//      znanych trackerów ich zatrutą wersją, zanim żądanie opuści przeglądarkę.
//      Reguły są rotowane co cykl (alarm), więc trucizna jest zmienna w czasie.
//   2. chrome.declarativeNetRequest.onRuleMatchedDebug (wymaga uprawnienia
//      "declarativeNetRequestFeedback", aktywne dla rozszerzeń unpacked/dev):
//      daje nam zdarzenie na KAŻDE dopasowanie reguły → emitujemy log dla jury.
//
// Świadome ograniczenie zakresu: długi losowy identyfikator sesji jest tu
// *szumem zatruwającym wartość pola profilowego* (bounded noise), a NIE próbą
// wywołania przepełnienia bufora / awarii serwera trackera. Obrona prywatności,
// nie atak na cudzą infrastrukturę.

import type {
  HoneypotLog,
  HoneypotPoison,
  TrackerSignature,
} from "../types"

// ---------------------------------------------------------------------------
// Konfiguracja
// ---------------------------------------------------------------------------

/** Zakres ID reguł DNR zarezerwowany dla Honeypota (poza zakresem Modułu A). */
const RULE_ID_BASE = 42001
const ROTATE_ALARM_NAME = "honeypot-rotate-poison"
const ROTATE_INTERVAL_MINUTES = 1

/** Klucz włączenia modułu + mirror licznika dla dashboardu (Moduł C). */
const STORAGE_KEY_ENABLED = "isHoneypotEnabled"
const STORAGE_KEY_COUNT = "trackersPoisonedCount"
const STORAGE_KEY_STATE = "cnd:state"

/**
 * Długość losowego ID sesji wstrzykiwanego jako szum profilowy.
 * Wystarczająco duża, by zaśmiecić pole identyfikatora i rozbić korelację
 * profilu — celowo NIE rozdmuchana do rozmiarów mających uszkodzić serwer.
 */
const POISON_ID_LENGTH = 768

// Zasoby, na których trackery wysyłają beacony/piksele/żądania API.
// Wartości string-owe są zgodne z DNR w runtime; @types/chrome typuje je jako
// enum ResourceType, więc rzutujemy całą regułę niżej (jak w background.ts).
const TRACKER_RESOURCE_TYPES: string[] = [
  "xmlhttprequest",
  "image",
  "ping",
  "script",
  "sub_frame",
  "media",
  "other",
]

// ---------------------------------------------------------------------------
// Baza sygnatur trackerów
// ---------------------------------------------------------------------------

const TRACKERS: TrackerSignature[] = [
  {
    name: "Google Analytics",
    // GA4 (/g/collect) oraz Universal (/collect), w tym subdomeny regionalne.
    urlFilter: "google-analytics.com/*collect",
    identityParams: ["cid", "uid", "_p", "sid", "gtm"],
  },
  {
    name: "Meta / Facebook Pixel",
    urlFilter: "||facebook.com/tr",
    identityParams: ["external_id", "fbp", "fbc", "ud", "cd"],
  },
  {
    name: "TikTok Pixel",
    urlFilter: "||analytics.tiktok.com/api",
    identityParams: ["ttclid", "external_id", "email", "phone_number"],
  },
  {
    name: "Hotjar",
    urlFilter: "||hotjar.com/api",
    identityParams: ["user_id", "session_id", "sv"],
  },
  {
    name: "Google DoubleClick",
    urlFilter: "||doubleclick.net/*",
    identityParams: ["uid", "google_cid", "dmt"],
  },
]

/** Mapa ruleId → tracker, do szybkiego rozpoznania w onRuleMatchedDebug. */
const RULE_TO_TRACKER = new Map<number, TrackerSignature>()
/** Mapa ruleId → opis bieżącej trucizny (do treści logu dla jury). */
const RULE_TO_POISON_DESC = new Map<number, string>()

// ---------------------------------------------------------------------------
// Poison Payload Generator — "absurdalne tożsamości dezinformacyjne"
// ---------------------------------------------------------------------------

// Sprzeczne geolokalizacje vs strefy czasowe vs języki — kombinacja, która
// nie może opisywać realnego człowieka i psuje segmentację geo/językową.
const GEO_CODES = ["PL", "JP", "BR", "NG", "IS", "NZ", "MN", "BO", "FJ"]
const TIMEZONES = [
  "Asia/Tokyo",
  "America/Argentina/Ushuaia",
  "Pacific/Kiritimati",
  "Africa/Nairobi",
  "Antarctica/Vostok",
  "Asia/Kathmandu",
]
const LANGS = ["sw", "is", "mi", "cy", "haw", "yo", "qu", "bo"]

// Sprzeczne dane demograficzne i zainteresowania — np. 90-latek polujący na
// niszowy sprzęt rolniczy wymieszany z luksusowymi jachtami.
const AGES = [7, 9, 13, 17, 88, 90, 103, 117]
const PERSONAS: string[] = [
  "80-letni mnich z Tybetu szukający traktora i gokarta",
  "13-letni miliarder kupujący jacht i pieluchy dla dorosłych",
  "102-letnia DJ-ka polująca na kombajn zbożowy i deskorolkę",
  "9-letni emeryt inwestujący w luksusowe jachty i siano",
  "stulatka-programistka asemblera kupująca rolki i aparat słuchowy",
  "niemowlę-prezes szukające opon do ciągnika i kawioru",
  "90-letni gamer kupujący nawóz, jacht i pampersy dla niemowląt",
]
const INTERESTS_A = [
  "niszowy sprzęt rolniczy",
  "łożyska do kombajnów",
  "pasza dla alpak",
  "dojarki przemysłowe",
]
const INTERESTS_B = [
  "luksusowe jachty motorowe",
  "prywatne odrzutowce",
  "diamenty inwestycyjne",
  "zegarki za milion",
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Generuje długi losowy identyfikator sesji jako szum profilowy.
 * Bounded noise: psuje wartość pola ID, nie celuje w awarię serwera.
 */
function generatePoisonId(length = POISON_ID_LENGTH): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  // crypto.getRandomValues jest dostępne w service workerze MV3.
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}

/**
 * Buduje jeden ładunek trucizny dla konkretnego trackera:
 *  - nadpisuje realne parametry profilujące (cid, _fbp, ttclid…) szumem,
 *  - dokłada sprzeczne tagi geo / strefy czasowej / języka / demografii.
 */
function generatePoison(tracker: TrackerSignature): HoneypotPoison {
  const geo = pick(GEO_CODES)
  const tz = pick(TIMEZONES)
  const lang = pick(LANGS)
  const age = pick(AGES)
  const persona = pick(PERSONAS)
  const interestA = pick(INTERESTS_A)
  const interestB = pick(INTERESTS_B)
  const poisonId = generatePoisonId()

  const params: Record<string, string> = {}

  // 1) Nadpisz realne identyfikatory trackera gigantycznym, losowym ID sesji.
  for (const key of tracker.identityParams) {
    params[key] = poisonId
  }

  // 2) Sprzeczne sygnały geo/czas/język — niszczą segmentację lokalizacyjną.
  params["geo"] = geo
  params["country"] = geo
  params["tz"] = tz
  params["timezone"] = tz
  params["lang"] = lang
  params["ul"] = lang // GA: "user language"

  // 3) Absurdalna demografia i sprzeczne zainteresowania.
  params["age"] = String(age)
  params["interests"] = `${interestA},${interestB}`
  params["persona"] = persona

  // 4) Dodatkowe śmieci o losowych kluczach — utrudniają filtrowanie po stronie
  //    profilera (nie zna z góry naszych pól).
  params[`x_${generatePoisonId(6)}`] = generatePoisonId(24)

  const description =
    `Wstrzyknięto profil: ${persona} ` +
    `(wiek=${age}, geo=${geo}, strefa=${tz}, język=${lang}); ` +
    `nadpisano [${tracker.identityParams.join(", ")}] ID sesji o długości ` +
    `${poisonId.length} znaków.`

  return { params, description }
}

// ---------------------------------------------------------------------------
// Reguły DNR — budowa i instalacja
// ---------------------------------------------------------------------------

function poisonToParamList(
  poison: HoneypotPoison
): chrome.declarativeNetRequest.QueryKeyValue[] {
  return Object.entries(poison.params).map(([key, value]) => ({ key, value }))
}

/** Buduje świeży zestaw reguł (jedna na tracker) z nową trucizną. */
function buildRules(): chrome.declarativeNetRequest.Rule[] {
  RULE_TO_TRACKER.clear()
  RULE_TO_POISON_DESC.clear()

  return TRACKERS.map((tracker, index) => {
    const ruleId = RULE_ID_BASE + index
    const poison = generatePoison(tracker)

    RULE_TO_TRACKER.set(ruleId, tracker)
    RULE_TO_POISON_DESC.set(ruleId, poison.description)

    return {
      id: ruleId,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          transform: {
            queryTransform: {
              addOrReplaceParams: poisonToParamList(poison),
            },
          },
        },
      },
      condition: {
        urlFilter: tracker.urlFilter,
        resourceTypes: TRACKER_RESOURCE_TYPES,
      },
    } as unknown as chrome.declarativeNetRequest.Rule
  })
}

function allRuleIds(): number[] {
  return TRACKERS.map((_, index) => RULE_ID_BASE + index)
}

/** Instaluje/odświeża reguły zatruwania (lub czyści je, gdy moduł wyłączony). */
async function installRules(enabled: boolean): Promise<void> {
  try {
    if (!enabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: allRuleIds(),
        addRules: [],
      })
      return
    }

    const rules = buildRules()
    await chrome.declarativeNetRequest.updateDynamicRules({
      // Usuń poprzednią generację zanim dodasz nową — idempotentne odświeżanie.
      removeRuleIds: allRuleIds(),
      addRules: rules,
    })
  } catch {
    // DNR może odmówić (np. limit reguł). Honeypot jest warstwą obronną,
    // nie twardą zależnością — nie wywracamy service workera.
  }
}

// ---------------------------------------------------------------------------
// Mostek do dashboardu (Moduł C) — "mocne logi dla jury"
// ---------------------------------------------------------------------------

function sendRuntimeMessage(message: unknown): void {
  try {
    const res = chrome.runtime.sendMessage(message as object)
    if (res && typeof (res as Promise<unknown>).catch === "function") {
      ;(res as Promise<unknown>).catch(() => undefined)
    }
  } catch {
    // Popup bywa zamknięty — wiadomości są best-effort.
  }
}

/**
 * Zgłasza udane zatrucie: wysyła trzy wiadomości naraz —
 *  1. HONEYPOT_ATTACK (kontrakt z wytycznych, dla dedykowanego nasłuchu),
 *  2. LOG_EVENT (pojawia się w istniejącym Real-time Loggerze, source "honeypot"),
 *  3. STATE_UPDATE (podbija licznik "Trackery zmylone" w dashboardzie).
 */
async function reportAttack(
  tracker: TrackerSignature,
  targetUrl: string,
  poisonedData: string
): Promise<void> {
  const timestamp = Date.now()

  const attack: HoneypotLog = {
    type: "HONEYPOT_ATTACK",
    payload: {
      trackerName: tracker.name,
      targetUrl,
      poisonedData,
      timestamp,
    },
  }
  sendRuntimeMessage(attack)

  sendRuntimeMessage({
    type: "LOG_EVENT",
    entry: {
      timestamp,
      source: "honeypot",
      message: `Zatruto ${tracker.name}: ${poisonedData}`,
      count: 1,
    },
  })

  await bumpPoisonedCount(1)
}

/** Inkrementuje licznik i lustrzanie zapisuje go do cnd:state (Moduł C). */
async function bumpPoisonedCount(delta: number): Promise<void> {
  const stored = await chrome.storage.local.get({
    [STORAGE_KEY_COUNT]: 0,
    [STORAGE_KEY_STATE]: {},
  })

  const total = ((stored[STORAGE_KEY_COUNT] as number) ?? 0) + delta
  const sharedState = {
    ...(stored[STORAGE_KEY_STATE] as Record<string, unknown>),
    // Dashboard pokazuje to pole jako "Trackery zmylone / profile rozbite".
    trackersBlockedCount: total,
  }

  await chrome.storage.local.set({
    [STORAGE_KEY_COUNT]: total,
    [STORAGE_KEY_STATE]: sharedState,
  })

  sendRuntimeMessage({
    type: "STATE_UPDATE",
    state: { trackersBlockedCount: total },
  })
}

// ---------------------------------------------------------------------------
// onRuleMatchedDebug — źródło zdarzeń logujących (dev / unpacked)
// ---------------------------------------------------------------------------

function attachMatchListener(): void {
  const dnr = chrome.declarativeNetRequest as typeof chrome.declarativeNetRequest & {
    onRuleMatchedDebug?: {
      addListener: (
        cb: (info: chrome.declarativeNetRequest.MatchedRuleInfoDebug) => void
      ) => void
    }
  }

  // onRuleMatchedDebug istnieje tylko z uprawnieniem declarativeNetRequestFeedback
  // i działa dla rozszerzeń wczytanych jako unpacked (idealne na hackathon/dev).
  dnr.onRuleMatchedDebug?.addListener((info) => {
    const ruleId = info.rule.ruleId
    const tracker = RULE_TO_TRACKER.get(ruleId)
    if (!tracker) return

    const targetUrl = info.request.url
    const poisonedData =
      RULE_TO_POISON_DESC.get(ruleId) ?? "Wstrzyknięto sprzeczny profil."

    void reportAttack(tracker, targetUrl, poisonedData)
  })
}

// ---------------------------------------------------------------------------
// Self-test — ręczne wyzwolenie ataku na potrzeby demo dla jury
// ---------------------------------------------------------------------------

/**
 * Wysyła nieszkodliwe żądanie do endpointu GA, by wyzwolić regułę DNR i pokazać
 * pełny przepływ (przechwycenie → zatrucie → log) na żądanie podczas prezentacji.
 * credentials: "omit" — nigdy nie dokładamy własnych ciasteczek do trackera.
 */
async function runSelfTest(): Promise<void> {
  const url =
    "https://www.google-analytics.com/g/collect?v=2&tid=G-DEMO&cid=demo&en=page_view"
  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      credentials: "omit",
      cache: "no-store",
    })
  } catch {
    // Żądanie i tak zostaje przechwycone/zatrute przez DNR — błąd sieci jest OK.
  }
}

// ---------------------------------------------------------------------------
// Listener wiadomości — toggluje moduł i obsługuje demo (osobny od Modułu A)
// ---------------------------------------------------------------------------

function attachMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as { type?: string; module?: string; enabled?: boolean }

    if (msg.type === "TOGGLE_MODULE" && msg.module === "honeypot") {
      const enabled = Boolean(msg.enabled)
      chrome.storage.local
        .set({ [STORAGE_KEY_ENABLED]: enabled })
        .then(() => installRules(enabled))
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }))
      return true // async
    }

    if (msg.type === "TRIGGER_HONEYPOT_TEST") {
      runSelfTest()
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }))
      return true
    }

    return undefined
  })
}

// ---------------------------------------------------------------------------
// Inicjalizacja publiczna — wołana z background.ts
// ---------------------------------------------------------------------------

let initialized = false

/**
 * Uruchamia "The Honeypot Trap". Idempotentne — bezpieczne przy wielokrotnym
 * przebudzeniu service workera (MV3 może go ubijać i wskrzeszać).
 */
export async function initHoneypotTrap(): Promise<void> {
  if (initialized) return
  initialized = true

  attachMatchListener()
  attachMessageListener()

  const { [STORAGE_KEY_ENABLED]: enabled } = await chrome.storage.local.get({
    [STORAGE_KEY_ENABLED]: true,
  })
  await installRules(Boolean(enabled))

  // Rotacja trucizny: świeży zestaw absurdalnych tożsamości co cykl.
  chrome.alarms.get(ROTATE_ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ROTATE_ALARM_NAME, {
        delayInMinutes: ROTATE_INTERVAL_MINUTES,
        periodInMinutes: ROTATE_INTERVAL_MINUTES,
      })
    }
  })

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ROTATE_ALARM_NAME) return
    const { [STORAGE_KEY_ENABLED]: on } = await chrome.storage.local.get({
      [STORAGE_KEY_ENABLED]: true,
    })
    if (on) await installRules(true)
  })
}
