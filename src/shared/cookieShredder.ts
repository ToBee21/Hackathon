// src/shared/cookieShredder.ts
// Moduł: Cookie Shredder — Rotacja / Zatruwanie ciasteczek trackingowych.
//
// W odróżnieniu od DataGhost (anonimowy ruch-wabik, który NIE dotyka profilu),
// ten moduł działa bezpośrednio na ciasteczkach śledzących w przeglądarce.
// Co cykl enumeruje wszystkie ciasteczka (chrome.cookies.getAll) i znanym
// trackerom (_ga, _fbp, _uetsid, MUID, _hj*, …) NADPISUJE wartość świeżym,
// losowym identyfikatorem. Efekt: przy każdej rotacji profiler widzi nowego
// użytkownika → nie da się zbudować stabilnego profilu między wizytami.
//
// ── Format-aware poisoning ──
// Nie kasujemy ciasteczka (tracker od razu ustawiłby świeże, prawdziwe ID).
// Zamiast tego mutujemy WYŁĄCZNIE segmenty wyglądające na identyfikator
// (ciągi ≥8 znaków alfanumerycznych), zachowując długość i klasę znaków
// (cyfry/hex/alnum). Markery wersji i krótkie liczby zostają nietknięte, więc
// ciasteczko pozostaje strukturalnie poprawne i tracker je akceptuje — tyle że
// niesie cudzą/losową tożsamość.
//
// Bezpieczeństwo: operujemy na ŚCISŁEJ liście nazw czysto-trackingowych. Nigdy
// nie ruszamy ciasteczek logowania/sesji/zgód (SID, CONSENT, csrftoken, …).

const STORAGE_KEY_ENABLED = "isCookieShredderEnabled"
const STORAGE_KEY_COUNT = "cookiesRotatedCount"
const STORAGE_KEY_STATE = "cnd:state"

const ROTATE_ALARM_NAME = "cookie-shredder-rotate"
const ROTATE_INTERVAL_MINUTES = 1

// ---------------------------------------------------------------------------
// Whitelist — wyłącznie czyste ciasteczka analityczne / reklamowe
// ---------------------------------------------------------------------------

/** Dokładne nazwy ciasteczek trackerów (bezpieczne do rotacji). */
const TRACKER_EXACT = new Set<string>([
  // Google Analytics / Ads
  "_ga", "_gid", "_gat", "_gcl_au", "_gcl_aw", "_gcl_dc", "__gads", "__gpi", "__eoi",
  // Meta / Facebook
  "_fbp", "_fbc",
  // Microsoft / Bing Ads + Clarity
  "_uetsid", "_uetvid", "_uetmsclkid", "_clck", "_clsk", "MUID",
  // Pozostałe sieci
  "personalization_id", "_pin_unauth", "_scid", "_sctr", "_ttp",
  "ajs_anonymous_id",
])

/** Prefiksy nazw (np. _ga_<measurementId>, _hjSessionUser_<id>). */
const TRACKER_PREFIX: string[] = [
  "_ga_", "_gac_", "_hj", "_uet", "tt_", "_pk_",
  "amplitude_", "mp_", "ajs_", "__utm",
]

function isTrackerCookie(name: string): boolean {
  if (TRACKER_EXACT.has(name)) return true
  return TRACKER_PREFIX.some((prefix) => name.startsWith(prefix))
}

// ---------------------------------------------------------------------------
// Generator trucizny — format-aware
// ---------------------------------------------------------------------------

function randomFromAlphabet(length: number, alphabet: string): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

/** Zwraca losowy token tej samej długości i klasy znaków co oryginał. */
function randomLike(token: string): string {
  if (/^\d+$/.test(token)) return randomFromAlphabet(token.length, "0123456789")
  if (/^[0-9a-f]+$/.test(token)) return randomFromAlphabet(token.length, "0123456789abcdef")
  if (/^[0-9A-F]+$/.test(token)) return randomFromAlphabet(token.length, "0123456789ABCDEF")
  return randomFromAlphabet(
    token.length,
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  )
}

/**
 * Podmienia segmenty-identyfikatory (≥8 znaków alfanumerycznych) na losowe,
 * zachowując strukturę reszty wartości. Zwraca oryginał, gdy nie ma czego zmienić
 * (np. ciasteczka-flagi typu _gat="1").
 */
function poisonValue(value: string): string {
  return value.replace(/[A-Za-z0-9]{8,}/g, (token) => randomLike(token))
}

// ---------------------------------------------------------------------------
// Zapis ciasteczka
// ---------------------------------------------------------------------------

function cookieUrl(cookie: chrome.cookies.Cookie): string {
  const host = cookie.domain.replace(/^\./, "")
  return `${cookie.secure ? "https" : "http"}://${host}${cookie.path || "/"}`
}

/** Nadpisuje jedno ciasteczko zatrutą wartością, zachowując wszystkie atrybuty. */
async function rotateCookie(cookie: chrome.cookies.Cookie): Promise<boolean> {
  const value = poisonValue(cookie.value)
  if (value === cookie.value) return false

  const details: chrome.cookies.SetDetails = {
    url: cookieUrl(cookie),
    name: cookie.name,
    value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    storeId: cookie.storeId,
    expirationDate: cookie.session ? undefined : cookie.expirationDate,
  }
  // Host-only cookies muszą zostać host-only — nie ustawiamy wtedy domeny.
  if (!cookie.hostOnly) details.domain = cookie.domain

  try {
    await chrome.cookies.set(details)
    return true
  } catch {
    // Pojedyncze zapisy mogą paść (np. polityki, __Host- prefiksy). Bez awarii SW.
    return false
  }
}

// ---------------------------------------------------------------------------
// Cykl rotacji
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

/** Inkrementuje licznik i lustrzanie zapisuje go do cnd:state (dashboard). */
async function bumpRotatedCount(delta: number): Promise<number> {
  const stored = await chrome.storage.local.get({
    [STORAGE_KEY_COUNT]: 0,
    [STORAGE_KEY_STATE]: {},
  })

  const total = ((stored[STORAGE_KEY_COUNT] as number) ?? 0) + delta
  await chrome.storage.local.set({
    [STORAGE_KEY_COUNT]: total,
    [STORAGE_KEY_STATE]: {
      ...(stored[STORAGE_KEY_STATE] as Record<string, unknown>),
      cookiesRotatedCount: total,
    },
  })

  sendRuntimeMessage({ type: "STATE_UPDATE", state: { cookiesRotatedCount: total } })
  return total
}

/** Enumeruje wszystkie ciasteczka i rotuje te należące do trackerów. */
async function rotateAll(): Promise<number> {
  const { [STORAGE_KEY_ENABLED]: enabled } = await chrome.storage.local.get({
    [STORAGE_KEY_ENABLED]: true,
  })
  if (!enabled) return 0

  let cookies: chrome.cookies.Cookie[]
  try {
    cookies = await chrome.cookies.getAll({})
  } catch {
    return 0
  }

  let rotated = 0
  const touched = new Set<string>()
  for (const cookie of cookies) {
    if (!isTrackerCookie(cookie.name)) continue
    if (await rotateCookie(cookie)) {
      rotated++
      touched.add(cookie.name)
    }
  }

  if (rotated > 0) {
    await bumpRotatedCount(rotated)
    const sample = Array.from(touched).slice(0, 4).join(", ")
    sendRuntimeMessage({
      type: "LOG_EVENT",
      entry: {
        timestamp: Date.now(),
        source: "cookieShredder",
        message: `Zrotowano ${rotated} ciasteczek trackerów (${sample}${
          touched.size > 4 ? ", …" : ""
        })`,
        count: rotated,
      },
    })
  }

  return rotated
}

// ---------------------------------------------------------------------------
// Listener wiadomości — toggluje moduł (osobny, samodzielny)
// ---------------------------------------------------------------------------

function attachMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as { type?: string; module?: string; enabled?: boolean }

    if (msg.type === "TOGGLE_MODULE" && msg.module === "cookieShredder") {
      const enabled = Boolean(msg.enabled)
      chrome.storage.local
        .set({ [STORAGE_KEY_ENABLED]: enabled })
        .then(() => (enabled ? rotateAll() : undefined)) // rotuj od razu po włączeniu
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }))
      return true // async
    }

    return undefined
  })
}

// ---------------------------------------------------------------------------
// Inicjalizacja publiczna — wołana z background.ts (idempotentna)
// ---------------------------------------------------------------------------

let initialized = false

export async function initCookieShredder(): Promise<void> {
  if (initialized) return
  initialized = true

  attachMessageListener()

  chrome.alarms.get(ROTATE_ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ROTATE_ALARM_NAME, {
        delayInMinutes: 0.5,
        periodInMinutes: ROTATE_INTERVAL_MINUTES,
      })
    }
  })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ROTATE_ALARM_NAME) void rotateAll()
  })

  // Pierwsza rotacja krótko po starcie service workera.
  void rotateAll()
}
