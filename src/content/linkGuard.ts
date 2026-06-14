// src/content/linkGuard.ts
// Link Guard — kontekstowa, realtime'owa ocena linku pod kursorem.
//
//  - Najechanie na <a href> => po krótkim "hover intent" liczymy lokalny werdykt
//    (src/shared/linkSafety/urlHeuristics) i pokazujemy pływający kafel przy
//    linku: szansa, że bezpieczny + konkretne powody.
//  - Klik w link HIGH/CRITICAL jest przechwytywany w fazie capture i wymusza
//    PODWÓJNE zastanowienie ("are you sure despite the risks?"). Użytkownik może
//    twardo zablokować klik albo świadomie przejść dalej.
//
// Zero sieci. Open Shadow DOM (warstwa UX, nie granica poufności) — spójnie z
// floatingWindow.ts. Top-frame only. Bez emoji (język wizualny konsoli).

import {
  analyzeLink,
  type LinkRiskLevel,
  type LinkVerdict
} from "../shared/linkSafety/urlHeuristics"
import {
  recordBlock,
  recordGate,
  recordOverride,
  recordScan
} from "../shared/linkSafety/linkGuardState"

// Zdarzenie, którym budzimy panel floating do odświeżenia karty Link Guard.
const LINKGUARD_UPDATE_EVENT = "cnd:linkguard:update"

const HOST_ID = "cloak-dagger-linkguard-root"
const ext = globalThis.chrome

const LEVEL_COLOR: Record<LinkRiskLevel, string> = {
  critical: "#FF5C77",
  high: "#FF7A66",
  medium: "#E6B450",
  low: "#2BD4C4"
}

const LEVEL_LABEL: Record<LinkRiskLevel, string> = {
  critical: "Krytyczny",
  high: "Wysoki",
  medium: "Podwyższony",
  low: "Niski"
}

const HOVER_INTENT_MS = 180
// Poniżej tego progu nie blokujemy kliknięć — tylko informujemy.
const HARD_GATE_LEVELS: ReadonlySet<LinkRiskLevel> = new Set(["high", "critical"])

let hostEl: HTMLElement | null = null
let shadow: ShadowRoot | null = null
let tip: HTMLElement | null = null
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let currentAnchor: HTMLAnchorElement | null = null
let modalOpen = false

// Linki, na które użytkownik świadomie wyraził zgodę mimo ryzyka (per sesja).
const allowedHrefs = new Set<string>()

export function initLinkGuard(): void {
  if (window.top !== window) return
  mountHost()
  document.addEventListener("mouseover", onMouseOver, true)
  document.addEventListener("mouseout", onMouseOut, true)
  // Przechwytujemy w fazie capture, ZANIM strona obsłuży klik.
  document.addEventListener("click", onClickCapture, true)
  window.addEventListener("scroll", hideTip, { passive: true })
}

function mountHost(): void {
  if (document.getElementById(HOST_ID)) {
    hostEl = document.getElementById(HOST_ID)
    shadow = hostEl?.shadowRoot ?? null
    return
  }
  hostEl = document.createElement("div")
  hostEl.id = HOST_ID
  hostEl.setAttribute("data-cloak-dagger", "linkguard")
  hostEl.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;"
  shadow = hostEl.attachShadow({ mode: "open" })
  shadow.appendChild(buildStyle())
  ;(document.body || document.documentElement).appendChild(hostEl)
}

function buildStyle(): HTMLStyleElement {
  const style = document.createElement("style")
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
    .tip {
      position: fixed; max-width: 300px; pointer-events: none;
      background: #0E1116; color: #C7D2DA; border: 1px solid #1c2b36;
      border-left-width: 3px; border-radius: 10px; padding: 9px 11px;
      box-shadow: 0 16px 44px rgba(0,0,0,0.5); opacity: 0; transition: opacity .12s ease;
    }
    .tip.show { opacity: 1; }
    .tip .top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .tip .lvl { font-size: 11px; font-weight: 700; }
    .tip .odds { font: 700 16px/1 ui-monospace, Consolas, monospace; }
    .tip .dom { font: 600 11px/1.3 ui-monospace, Consolas, monospace; color: #9AA4B2; margin-top: 5px; overflow-wrap: anywhere; }
    .tip .bar { height: 4px; border-radius: 999px; background: #18232b; overflow: hidden; margin-top: 7px; }
    .tip .bar span { display: block; height: 100%; border-radius: inherit; }
    .tip ul { margin: 7px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
    .tip li { font-size: 10.5px; line-height: 1.35; color: #C7D2DA; padding-left: 11px; position: relative; }
    .tip li::before { content: "-"; position: absolute; left: 0; color: #6b7a85; }
    .tip .ok { font-size: 10.5px; color: #2BD4C4; margin-top: 6px; }

    .scrim {
      position: fixed; inset: 0; background: rgba(5,8,11,0.62); pointer-events: auto;
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .modal {
      width: 380px; max-width: 92vw; background: #0E1116; color: #C7D2DA;
      border: 1px solid #1c2b36; border-radius: 14px; box-shadow: 0 28px 80px rgba(0,0,0,0.6);
      overflow: hidden;
    }
    .modal .mhdr { display: flex; align-items: center; gap: 8px; padding: 13px 15px; border-bottom: 1px solid #1c2b36; }
    .modal .mhdr .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
    .modal .mhdr .mttl { font-size: 13px; font-weight: 700; color: #E6EDF3; }
    .modal .mbody { padding: 14px 15px; display: flex; flex-direction: column; gap: 11px; }
    .modal .mdom { font: 600 12px/1.4 ui-monospace, Consolas, monospace; color: #FF7A66; overflow-wrap: anywhere; }
    .modal .mscore { display: flex; align-items: baseline; gap: 8px; }
    .modal .mscore b { font: 800 26px/1 ui-monospace, Consolas, monospace; }
    .modal .mscore span { font-size: 11px; color: #9AA4B2; }
    .modal ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
    .modal li { font-size: 11.5px; line-height: 1.4; padding-left: 12px; position: relative; }
    .modal li::before { content: "-"; position: absolute; left: 0; color: #FF7A66; }
    .modal .mwarn { font-size: 11.5px; color: #E6B450; line-height: 1.45; }
    .modal .mftr { display: flex; flex-direction: column; gap: 8px; padding: 13px 15px; border-top: 1px solid #1c2b36; }
    .modal .row { display: flex; gap: 8px; }
    .btn { flex: 1 1 auto; padding: 9px 11px; border-radius: 9px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
    .btn.block { background: rgba(43,212,196,0.1); color: #2BD4C4; border-color: #2BD4C4; }
    .btn.ghost { background: transparent; color: #9AA4B2; border-color: #1c2b36; }
    .btn.danger { background: rgba(255,92,119,0.1); color: #FF5C77; border-color: #FF5C77; }
    .btn:disabled { opacity: .4; cursor: default; }
    .countdown { font: 700 11px/1 ui-monospace, Consolas, monospace; color: #6b7a85; text-align: center; }
  `
  return style
}

// ---------------------------------------------------------------------------
// Hover tooltip
// ---------------------------------------------------------------------------

function anchorFrom(target: EventTarget | null): HTMLAnchorElement | null {
  const el = target instanceof Element ? target : null
  return (el?.closest("a[href]") as HTMLAnchorElement | null) ?? null
}

function onMouseOver(e: MouseEvent): void {
  const anchor = anchorFrom(e.target)
  if (!anchor || anchor === currentAnchor || modalOpen) return
  currentAnchor = anchor
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    const verdict = verdictFor(anchor)
    if (!verdict) return
    recordScan(
      {
        domain: verdict.registrableDomain || verdict.scheme + ":",
        level: verdict.level,
        score: verdict.score,
        odds: verdict.legitimacyOdds
      },
      HARD_GATE_LEVELS.has(verdict.level)
    )
    notifyPanel()
    showTip(anchor, verdict)
  }, HOVER_INTENT_MS)
}

function onMouseOut(e: MouseEvent): void {
  const anchor = anchorFrom(e.target)
  if (anchor && anchor === currentAnchor) {
    currentAnchor = null
    if (hoverTimer) clearTimeout(hoverTimer)
    hideTip()
  }
}

function verdictFor(anchor: HTMLAnchorElement): LinkVerdict | null {
  return analyzeLink(anchor.getAttribute("href") ?? "", {
    anchorText: anchor.textContent ?? "",
    pageOrigin: location.origin
  })
}

function showTip(anchor: HTMLAnchorElement, verdict: LinkVerdict): void {
  if (!shadow) return
  tip?.remove()
  const color = LEVEL_COLOR[verdict.level]
  const el = document.createElement("div")
  el.className = "tip"
  el.style.borderLeftColor = color
  el.setAttribute("data-cloak-dagger", "linkguard-tip")
  el.setAttribute("data-level", verdict.level)

  const reasons = verdict.signals.slice(0, 4)
  const reasonsHtml =
    reasons.length > 0
      ? `<ul>${reasons.map((s) => `<li>${escapeHtml(s.reason)}</li>`).join("")}</ul>`
      : `<div class="ok">Brak sygnałów ryzyka w adresie linku.</div>`

  el.innerHTML = `
    <div class="top">
      <span class="lvl" style="color:${color}">Ryzyko: ${LEVEL_LABEL[verdict.level]}</span>
      <span class="odds" style="color:${color}">${verdict.legitimacyOdds}%</span>
    </div>
    <div class="dom">${escapeHtml(verdict.registrableDomain || verdict.scheme + ":")}  ·  szansa, że bezpieczny</div>
    <div class="bar"><span style="width:${verdict.legitimacyOdds}%;background:${color}"></span></div>
    ${reasonsHtml}`

  shadow.appendChild(el)
  tip = el
  positionTip(anchor, el)
  requestAnimationFrame(() => el.classList.add("show"))
}

function positionTip(anchor: HTMLAnchorElement, el: HTMLElement): void {
  const rect = anchor.getBoundingClientRect()
  const tw = el.offsetWidth || 300
  const th = el.offsetHeight || 90
  let left = rect.left
  let top = rect.bottom + 8
  if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8
  if (left < 8) left = 8
  if (top + th > window.innerHeight - 8) top = rect.top - th - 8
  el.style.left = `${Math.max(8, left)}px`
  el.style.top = `${Math.max(8, top)}px`
}

function hideTip(): void {
  tip?.remove()
  tip = null
}

// ---------------------------------------------------------------------------
// Click gate — podwójne zastanowienie na HIGH/CRITICAL
// ---------------------------------------------------------------------------

function onClickCapture(e: MouseEvent): void {
  if (e.button !== 0 || modalOpen) return
  const anchor = anchorFrom(e.target)
  if (!anchor) return
  const href = anchor.getAttribute("href") ?? ""
  if (allowedHrefs.has(href)) return

  const verdict = verdictFor(anchor)
  if (!verdict || !HARD_GATE_LEVELS.has(verdict.level)) return

  // Twarde wstrzymanie nawigacji — strona NIE dostaje tego kliknięcia.
  e.preventDefault()
  e.stopImmediatePropagation()
  hideTip()
  openModal(anchor, verdict)
}

function openModal(anchor: HTMLAnchorElement, verdict: LinkVerdict): void {
  if (!shadow) return
  modalOpen = true
  recordGate()
  notifyPanel()
  logEvent(`Wstrzymano klik w link wysokiego ryzyka: ${verdict.registrableDomain}`)

  const color = LEVEL_COLOR[verdict.level]
  const scrim = document.createElement("div")
  scrim.className = "scrim"
  scrim.setAttribute("data-cloak-dagger", "linkguard-modal")

  const modal = document.createElement("div")
  modal.className = "modal"
  const reasons = verdict.signals.slice(0, 5)
  modal.innerHTML = `
    <div class="mhdr">
      <span class="dot" style="background:${color}"></span>
      <span class="mttl">Czy na pewno otworzyć ten link?</span>
    </div>
    <div class="mbody">
      <div class="mscore"><b style="color:${color}">${verdict.score}</b><span>/100 ryzyka · ${LEVEL_LABEL[verdict.level]}</span></div>
      <div class="mdom">${escapeHtml(anchor.href)}</div>
      <ul>${reasons.map((s) => `<li>${escapeHtml(s.reason)}</li>`).join("")}</ul>
      <div class="mwarn">Linki o takim profilu często służą do wyłudzeń. Otwórz tylko, jeśli w pełni ufasz źródłu.</div>
    </div>
    <div class="mftr"></div>`

  const ftr = modal.querySelector(".mftr") as HTMLElement
  buildBlockStage(ftr, anchor, verdict, scrim)

  scrim.appendChild(modal)
  scrim.addEventListener("click", (ev) => {
    if (ev.target === scrim) closeModal(scrim) // klik w tło = bezpieczne anulowanie
  })
  shadow.appendChild(scrim)
}

// Etap 1: domyślnie chroni. "Zablokuj" zamyka, "Mimo to..." przechodzi do etapu 2.
function buildBlockStage(
  ftr: HTMLElement,
  anchor: HTMLAnchorElement,
  verdict: LinkVerdict,
  scrim: HTMLElement
): void {
  ftr.innerHTML = ""
  const row = document.createElement("div")
  row.className = "row"

  const block = document.createElement("button")
  block.className = "btn block"
  block.textContent = "Zablokuj (zalecane)"
  block.addEventListener("click", () => {
    recordBlock()
    notifyPanel()
    logEvent(`Zablokowano link: ${verdict.registrableDomain}`)
    closeModal(scrim)
  })

  const proceed = document.createElement("button")
  proceed.className = "btn ghost"
  proceed.textContent = "Chcę otworzyć mimo to"
  proceed.addEventListener("click", () => buildConfirmStage(ftr, anchor, verdict, scrim))

  row.append(block, proceed)
  ftr.appendChild(row)
}

// Etap 2 (podwójne zastanowienie): krótki cooldown + jawne, czerwone potwierdzenie.
function buildConfirmStage(
  ftr: HTMLElement,
  anchor: HTMLAnchorElement,
  verdict: LinkVerdict,
  scrim: HTMLElement
): void {
  ftr.innerHTML = ""
  const countdown = document.createElement("div")
  countdown.className = "countdown"
  ftr.appendChild(countdown)

  const row = document.createElement("div")
  row.className = "row"
  const cancel = document.createElement("button")
  cancel.className = "btn block"
  cancel.textContent = "Anuluj"
  cancel.addEventListener("click", () => {
    logEvent(`Wycofano się z otwarcia: ${verdict.registrableDomain}`)
    closeModal(scrim)
  })
  const confirm = document.createElement("button")
  confirm.className = "btn danger"
  confirm.disabled = true
  row.append(cancel, confirm)
  ftr.appendChild(row)

  // 3-sekundowy cooldown wymusza chwilę namysłu, zanim "Otwórz" stanie się klikalne.
  let left = 3
  const tick = () => {
    if (left > 0) {
      countdown.textContent = `Przeczytaj ryzyko... ${left}s`
      confirm.textContent = `Otwórz mimo ryzyka (${left})`
      left -= 1
      setTimeout(tick, 1000)
    } else {
      countdown.textContent = "Otwierasz na własną odpowiedzialność."
      confirm.textContent = "Otwórz mimo ryzyka"
      confirm.disabled = false
    }
  }
  tick()

  confirm.addEventListener("click", () => {
    const href = anchor.getAttribute("href") ?? ""
    allowedHrefs.add(href)
    recordOverride()
    notifyPanel()
    logEvent(`Użytkownik świadomie otworzył ryzykowny link: ${verdict.registrableDomain}`)
    closeModal(scrim)
    const target = anchor.target && anchor.target !== "_self" ? anchor.target : "_self"
    if (target === "_self") location.assign(anchor.href)
    else window.open(anchor.href, target, "noopener,noreferrer")
  })
}

function closeModal(scrim: HTMLElement): void {
  scrim.remove()
  modalOpen = false
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

// Budzi panel floating, by przerysował kartę Link Guard z aktualnymi licznikami.
function notifyPanel(): void {
  try {
    window.dispatchEvent(new CustomEvent(LINKGUARD_UPDATE_EVENT))
  } catch {
    // brak window/CustomEvent w nietypowym realmie — ignorujemy
  }
}

function logEvent(message: string): void {
  try {
    ext?.runtime?.sendMessage?.({
      type: "LOG_EVENT",
      entry: { timestamp: Date.now(), source: "linkGuard", message, count: 1 }
    })
  } catch {
    // SW może spać; telemetria best-effort.
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
