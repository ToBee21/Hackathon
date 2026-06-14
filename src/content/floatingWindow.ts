// src/content/floatingWindow.ts
// The contextual floating layer  -  the product's main on-page surface.
//
// Design choices (honest):
//  - OPEN Shadow DOM host. Open (not closed) so Playwright can pierce it for
//    end-to-end verification, and because this overlay is a UX convenience layer,
//    NOT a confidentiality boundary. The host page CAN observe that a DOM node
//    exists. Therefore: only page-derived, non-secret content lives here (risk
//    scores, labels, snippets that already came from the page). Heavier or more
//    sensitive workflows belong in the side panel / extension iframe.
//  - Cards are rendered from the feature registry, never hardcoded.
//  - Model inference is never faked: the panel shows the real verdict source and
//    a "deep scan" button that honestly reports loading / disabled / error.
//
// Runs top-frame only. State persists per-origin in chrome.storage.local.

import { classifyHeuristic } from "../shared/aiDeepDive/score"
import {
  DEFAULT_AI_DEEP_DIVE_CONFIG,
  STORAGE_KEY_AI_DEEP_DIVE_CONFIG,
  normalizeAiDeepDiveConfig,
  type AiDeepDiveRuntimeConfig
} from "../shared/aiDeepDive/config"
import {
  buildLlmInsightFromRiskResult,
  formatVerdictLabel,
  type LlmInsightSignal,
  type LlmInsightView
} from "../shared/aiDeepDive/llmView"
import { getModelOption } from "../shared/aiDeepDive/models"
import type { AiDeepDiveRiskResult } from "../shared/aiDeepDive/types"
import { requestDeepScan } from "./deepScanClient"
import {
  runActiveFeatures,
  sortCards,
  type CardLevel,
  type FeatureCard
} from "../shared/featureRegistry"
import { aiProfilingDetector } from "../shared/features/aiProfilingDetector"
import { pageExplainer } from "../shared/features/pageExplainer"
import { linkGuardFeature } from "../shared/features/linkGuardFeature"
import { mailGuardFeature } from "../shared/features/mailGuardFeature"
import { dataFootprintFeature } from "../shared/features/dataFootprintFeature"
import { registerFeature } from "../shared/featureRegistry"
import type { DeepScanRuntimeStatus, PageAnalysis } from "../shared/messages"
import { describePage, type PageContext } from "../shared/pageContextSchema"
import { extractVisibleTextFromPage } from "./aiDeepDive/extractVisibleText"
import { buildPageContext } from "./pageContext"

const HOST_ID = "cloak-dagger-floating-root"
const STORAGE_KEY_FLOATING = "cnd:floating"
// Global advanced-settings switch for the on-page panel (dashboard toggle).
const STORAGE_KEY_FLOATING_ENABLED = "cnd:floating:enabled"
const ext = globalThis.chrome

interface FloatingState {
  collapsed: boolean
  x: number | null
  y: number | null
  /** Edge the collapsed ribbon is snapped to. */
  dock: "left" | "right"
  /** Vertical position of the collapsed ribbon (top, px). */
  ribbonY: number | null
  disabled: boolean
}

interface LlmOutputState {
  active: boolean
  stage: string
  modelId: string
  device: string
  dtype: string
  elapsedMs: number | null
  progress: number | null
  insight: LlmInsightView | null
  error: string
}

type RuntimeStatusRecord = Partial<DeepScanRuntimeStatus> &
  Record<string, unknown>

const DEFAULT_STATE: FloatingState = {
  collapsed: true,
  x: null,
  y: null,
  dock: "right",
  ribbonY: null,
  disabled: false
}

// Collapsed ribbon footprint (kept in sync with the .ribbon CSS).
const RIBBON_W = 34
const RIBBON_H = 104

// One-shot signal so render() plays the expand/collapse morph exactly once on
// the transition that triggered it (not on every data-driven re-render).
let pendingMorph: "expand" | "collapse" | null = null

function isTrustedActivation(event: Event): boolean {
  return event.isTrusted
}

const LEVEL_COLOR: Record<CardLevel, string> = {
  critical: "#FF5C77",
  high: "#FF7A66",
  medium: "#E6B450",
  low: "#2BD4C4",
  info: "#9AA4B2"
}

// Register the built-in features once per content-script load.
registerFeature(aiProfilingDetector)
registerFeature(pageExplainer)
registerFeature(linkGuardFeature)
registerFeature(mailGuardFeature)
registerFeature(dataFootprintFeature)

let hostEl: HTMLElement | null = null
let shadow: ShadowRoot | null = null
let state: FloatingState = { ...DEFAULT_STATE }
let lastRisk: AiDeepDiveRiskResult | null = null
let deepScanStatus: "idle" | "loading" | "done" | "disabled" | "error" = "idle"
let deepScanMessage = ""
let llmOutputState: LlmOutputState = emptyLlmOutputState()
let llmCollapsed = false
let activeDeepScanRequestId: string | null = null
let rerenderQueued = false
let deepScanStatusListenerInstalled = false
let floatingEnabledListenerInstalled = false
// Auto-open the panel once per page when a real (high/critical) verdict lands,
// unless the user has minimized it back to the ribbon on this page.
let autoOpenedForPage = false
let userMinimized = false

export async function initFloatingWindow(): Promise<void> {
  if (window.top !== window) return
  if (!document.body && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void initFloatingWindow(), {
      once: true
    })
    return
  }

  // Honor the global advanced-settings switch, and re-mount/unmount live when it
  // flips, so toggling the panel never requires a reload.
  installFloatingEnabledListener()
  if (!(await isFloatingEnabled())) return

  state = await loadState()
  if (state.disabled) return

  mountHost()
  installDeepScanStatusListener()
  scheduleAnalyze()
  installSpaSurvival()
  installSelectionWatcher()
  installLinkGuardWatcher()
}

function isFloatingEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ext?.storage?.local) return resolve(true)
    try {
      ext.storage.local.get({ [STORAGE_KEY_FLOATING_ENABLED]: true }, (res) =>
        resolve(Boolean(res?.[STORAGE_KEY_FLOATING_ENABLED]))
      )
    } catch {
      resolve(true)
    }
  })
}

function installFloatingEnabledListener(): void {
  if (floatingEnabledListenerInstalled) return
  floatingEnabledListenerInstalled = true
  try {
    ext?.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "local" || !changes[STORAGE_KEY_FLOATING_ENABLED]) return
      const enabled = Boolean(changes[STORAGE_KEY_FLOATING_ENABLED].newValue ?? true)
      if (enabled) {
        if (!document.getElementById(HOST_ID) && !state.disabled) {
          mountHost()
          scheduleAnalyze()
        }
      } else {
        hostEl?.remove()
        hostEl = null
        shadow = null
      }
    })
  } catch {
    /* storage telemetry unavailable; panel still respects the init-time flag */
  }
}

// Link Guard aktualizuje swoje liczniki w pamięci; tu tylko odświeżamy kartę,
// gdy panel jest otwarty (bez ponownego skanu treści strony).
function installLinkGuardWatcher(): void {
  const refresh = () => {
    if (state.collapsed || !lastPage || lastPage.excluded) return
    lastCards = sortCards(
      runActiveFeatures({ page: lastPage, risk: lastRisk ?? classifyHeuristic(extractVisibleTextFromPage()) })
    )
    render()
  }
  window.addEventListener("cnd:linkguard:update", refresh)
  window.addEventListener("cnd:mailguard:update", refresh)
}

// ---------------------------------------------------------------------------
// Mount + render
// ---------------------------------------------------------------------------

function mountHost(): void {
  if (document.getElementById(HOST_ID)) {
    hostEl = document.getElementById(HOST_ID)
    return
  }
  hostEl = document.createElement("div")
  hostEl.id = HOST_ID
  hostEl.setAttribute("data-cloak-dagger", "floating")
  // Host is fixed and click-through; only the rendered widget captures events.
  hostEl.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;pointer-events:none;"
  shadow = hostEl.attachShadow({ mode: "open" })
  shadow.appendChild(buildStyle())
  const mount = document.body || document.documentElement
  mount.appendChild(hostEl)
  render()
}

function buildStyle(): HTMLStyleElement {
  const style = document.createElement("style")
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
    .widget { position: fixed; pointer-events: auto; will-change: left, top, transform; }
    /* Spring-snap to the edge on release; 1:1 (no transition) while dragging. */
    .widget.snapping { transition: left .36s cubic-bezier(.34,1.56,.64,1), top .22s ease; }
    .widget.dragging { transition: none !important; }

    /* Collapsed state = edge ribbon (wstazka), not a floating circle. */
    .ribbon {
      position: relative; width: ${RIBBON_W}px; height: ${RIBBON_H}px;
      display: flex; flex-direction: column; align-items: center; justify-content: space-between;
      padding: 9px 0; cursor: grab; user-select: none; touch-action: none;
      color: #2BD4C4; background: linear-gradient(180deg, #12171d, #0b0e12);
      border: 1px solid #233742;
    }
    .ribbon:active { cursor: grabbing; }
    .ribbon.dock-right { border-radius: 13px 0 0 13px; border-right: none; box-shadow: -7px 9px 28px rgba(0,0,0,0.46); }
    .ribbon.dock-left  { border-radius: 0 13px 13px 0; border-left: none;  box-shadow:  7px 9px 28px rgba(0,0,0,0.46); }
    .ribbon::before {
      content: ""; position: absolute; top: 12px; bottom: 12px; width: 2px; border-radius: 2px;
      background: currentColor; opacity: .85;
    }
    .ribbon.dock-right::before { right: 0; }
    .ribbon.dock-left::before  { left: 0; }
    .ribbon[data-level="critical"], .ribbon[data-level="high"] { color: #FF5C77; }
    .ribbon[data-level="medium"] { color: #E6B450; }
    .ribbon .rb-grip {
      width: 10px; height: 13px; flex: none; color: #5d6b75;
      background-image: radial-gradient(currentColor 1px, transparent 1.5px);
      background-size: 5px 5px;
    }
    .ribbon .rb-mark {
      flex: 1 1 auto; display: flex; align-items: center; justify-content: center; color: inherit;
    }
    .ribbon .rb-mark svg { width: 18px; height: 18px; display: block; }
    .ribbon .rb-score {
      flex: none; min-width: 22px; text-align: center; padding: 3px 0; border-radius: 6px;
      font: 700 12px/1 ui-monospace, Consolas, monospace; color: inherit;
      background: rgba(43,212,196,.12);
    }
    .ribbon[data-level="critical"] .rb-score, .ribbon[data-level="high"] .rb-score { background: rgba(255,92,119,.14); }
    .ribbon[data-level="medium"] .rb-score { background: rgba(230,180,80,.14); }

    /* Morph: panel grows out of the ribbon; ribbon slides back from the panel. */
    .panel.morph-in { animation: cndMorphPanel .24s cubic-bezier(.2,.85,.25,1.15) both; }
    @keyframes cndMorphPanel { from { opacity: 0; transform: scale(.78); } to { opacity: 1; transform: scale(1); } }
    .ribbon.morph-in { animation: cndMorphRibbon .22s cubic-bezier(.34,1.56,.64,1) both; }
    @keyframes cndMorphRibbon {
      from { opacity: 0; transform: translateX(var(--rb-from, 0)) scale(.85); }
      to   { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .widget.snapping { transition: none; }
      .panel.morph-in, .ribbon.morph-in { animation: none; }
    }
    .panel {
      width: 320px; max-height: 70vh; overflow: hidden;
      background: #0E1116; color: #C7D2DA; border: 1px solid #1c2b36;
      border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      display: flex; flex-direction: column;
    }
    .hdr {
      display: flex; align-items: center; gap: 8px; padding: 10px 12px;
      border-bottom: 1px solid #1c2b36; cursor: grab; user-select: none;
    }
    .hdr .dot { width: 9px; height: 9px; border-radius: 50%; background: #2BD4C4; flex: none; }
    .hdr .ttl { font-size: 12px; font-weight: 600; color: #E6EDF3; }
    .hdr .sub { font-size: 10px; color: #6b7a85; }
    .hdr .grow { flex: 1 1 auto; min-width: 0; }
    .iconbtn {
      width: 24px; height: 24px; border-radius: 6px; border: none;
      background: transparent; color: #9AA4B2; cursor: pointer; font-size: 13px;
    }
    .iconbtn:hover { background: rgba(255,255,255,0.06); color: #E6EDF3; }
    .body { padding: 10px 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .card {
      border: 1px solid #1c2b36; border-left-width: 3px; border-radius: 8px;
      padding: 8px 10px; background: rgba(255,255,255,0.02);
    }
    .card .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .card .name { font-size: 11px; font-weight: 600; color: #E6EDF3; }
    .card .score { font-family: ui-monospace, Consolas, monospace; font-size: 13px; font-weight: 700; }
    .card .line { font-size: 11px; color: #C7D2DA; margin-top: 4px; line-height: 1.4; }
    .card .act { font-size: 10px; color: #2BD4C4; margin-top: 5px; }
    .card .src { font-size: 9px; color: #6b7a85; margin-top: 5px; text-transform: uppercase; letter-spacing: .08em; }
    .ftr { border-top: 1px solid #1c2b36; padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; }
    .btn {
      width: 100%; padding: 7px 10px; border-radius: 8px; border: 1px solid #2BD4C4;
      background: rgba(43,212,196,0.08); color: #2BD4C4; font-size: 11px; font-weight: 600; cursor: pointer;
    }
    .btn.ghost { border-color: #1c2b36; background: transparent; color: #9AA4B2; }
    .btn:disabled { opacity: .45; cursor: default; }
    .status { font-size: 10px; color: #6b7a85; }
    .status.err { color: #FF7A66; }
    .llmout {
      border: 1px solid #1c2b36; border-radius: 8px;
      background: rgba(255,255,255,0.025); overflow: hidden;
    }
    .llmout.err { border-color: rgba(255,122,102,0.65); }
    .llmhead {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 6px 6px 8px; border-bottom: 1px solid #1c2b36; cursor: pointer;
    }
    .llmhead .ttl { font-size: 11px; font-weight: 600; color: #E6EDF3; flex: 1 1 auto; min-width: 0; }
    .llmphase {
      font-size: 9px; text-transform: uppercase; letter-spacing: .06em;
      color: #9AA4B2; border: 1px solid #263746; border-radius: 999px;
      padding: 2px 7px; white-space: nowrap; flex: none;
    }
    .llmphase[data-tone="load"] { color: #2BD4C4; border-color: rgba(43,212,196,0.4); }
    .llmphase[data-tone="work"] { color: #E6B450; border-color: rgba(230,180,80,0.4); }
    .llmphase[data-tone="done"] { color: #2BD4C4; border-color: rgba(43,212,196,0.55); }
    .llmphase[data-tone="err"]  { color: #FF7A66; border-color: rgba(255,122,102,0.5); }
    .llmchev {
      width: 22px; height: 22px; border-radius: 6px; border: none; flex: none;
      background: transparent; color: #9AA4B2; cursor: pointer; font-size: 11px; line-height: 1;
    }
    .llmchev:hover { background: rgba(255,255,255,0.06); color: #E6EDF3; }
    .llmbody { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
    .llminsight { display: flex; flex-direction: column; gap: 8px; }
    .llmhero { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: start; }
    .llmkicker { color: #9AA4B2; font-size: 9px; text-transform: uppercase; }
    .llmverdict { color: #E6EDF3; font-size: 13px; font-weight: 700; margin-top: 1px; }
    .llmscore {
      min-width: 42px; text-align: right; font: 700 18px/1 ui-monospace, Consolas, monospace;
    }
    .llmbar { height: 5px; border-radius: 999px; background: #18232b; overflow: hidden; }
    .llmbar span { display: block; height: 100%; border-radius: inherit; }
    .llmreason { color: #C7D2DA; font-size: 11px; line-height: 1.45; }
    .llmchips { display: flex; flex-wrap: wrap; gap: 5px; }
    .llmchip {
      border: 1px solid #263746; border-radius: 999px; padding: 3px 7px;
      background: rgba(255,255,255,0.035); color: #D8E1E8; font-size: 10px;
      max-width: 100%; overflow-wrap: anywhere;
    }
    .llmchip strong { color: #E6EDF3; font-weight: 700; }
    .llmrisks { display: grid; gap: 5px; }
    .llmrisk { display: grid; grid-template-columns: 84px 1fr 30px; gap: 6px; align-items: center; }
    .llmrisk span { color: #9AA4B2; font-size: 9px; }
    .llmfoot { color: #6b7a85; font-size: 9px; text-transform: uppercase; overflow-wrap: anywhere; }
    .llmloading { color: #C7D2DA; font-size: 11px; line-height: 1.45; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .llmloading .pct { font: 700 11px/1 ui-monospace, Consolas, monospace; color: #2BD4C4; flex: none; }
    .llmprog { height: 6px; border-radius: 999px; background: #18232b; overflow: hidden; }
    .llmprog span { display: block; height: 100%; border-radius: inherit; background: #2BD4C4; transition: width .25s ease; }
    .llmprog.indet span {
      width: 35%; background: linear-gradient(90deg, rgba(43,212,196,0.15), #2BD4C4, rgba(43,212,196,0.15));
      animation: llmslide 1.15s ease-in-out infinite;
    }
    @keyframes llmslide { 0% { margin-left: -35%; } 100% { margin-left: 100%; } }
    .excluded { font-size: 11px; color: #E6B450; line-height: 1.5; }
  `
  return style
}

function currentLevel(): CardLevel {
  if (!lastRisk) return "info"
  const l = lastRisk.level
  return l === "critical" || l === "high" || l === "medium" ? l : "low"
}

function render(): void {
  if (!shadow) return
  // Remove previous widget (keep the <style>).
  shadow.querySelector(".widget")?.remove()

  const widget = document.createElement("div")
  widget.className = "widget"
  positionWidget(widget)

  if (state.collapsed) {
    const ribbon = buildRibbon()
    if (pendingMorph === "collapse") {
      ribbon.classList.add("morph-in")
      ribbon.style.setProperty("--rb-from", state.dock === "left" ? "-20px" : "20px")
    }
    widget.appendChild(ribbon)
  } else {
    const panel = buildPanel()
    if (pendingMorph === "expand") {
      panel.classList.add("morph-in")
      panel.style.transformOrigin = state.dock === "left" ? "0% 22%" : "100% 22%"
    }
    widget.appendChild(panel)
  }
  pendingMorph = null
  shadow.appendChild(widget)
}

function positionWidget(widget: HTMLElement): void {
  if (state.collapsed) {
    // Ribbon docks flush to an edge; only its vertical position is user-chosen.
    const y = state.ribbonY ?? Math.round(window.innerHeight / 2 - RIBBON_H / 2)
    widget.style.top = `${clampRibbonY(y)}px`
    widget.style.bottom = "auto"
    if (state.dock === "left") {
      widget.style.left = "0px"
      widget.style.right = "auto"
    } else {
      widget.style.right = "0px"
      widget.style.left = "auto"
    }
    return
  }
  // Panel free-floats from its remembered position, else bottom-right.
  if (state.x !== null && state.y !== null) {
    widget.style.left = `${clampX(state.x)}px`
    widget.style.top = `${clampY(state.y)}px`
    widget.style.right = "auto"
    widget.style.bottom = "auto"
  } else {
    widget.style.right = "20px"
    widget.style.bottom = "20px"
    widget.style.left = "auto"
    widget.style.top = "auto"
  }
}

function buildRibbon(): HTMLElement {
  const ribbon = document.createElement("div")
  ribbon.className = `ribbon dock-${state.dock}`
  // Stable e2e hook (verify-floating-window.mjs). The visual is now an edge ribbon.
  ribbon.setAttribute("data-cloak-dagger", "bubble")
  ribbon.setAttribute("data-level", currentLevel())
  ribbon.setAttribute("role", "button")
  ribbon.setAttribute("tabindex", "0")
  ribbon.setAttribute(
    "aria-label",
    `PrivacyMyst Deep-Dive  -  ${
      lastRisk ? `ryzyko ${lastRisk.score}, otwórz panel` : "otwórz panel"
    }`
  )
  ribbon.title = "PrivacyMyst Deep-Dive — kliknij, aby otworzyć panel"
  ribbon.innerHTML = `
    <span class="rb-grip" aria-hidden="true"></span>
    <span class="rb-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/></svg></span>
    <span class="rb-score">${lastRisk ? escapeHtml(String(lastRisk.score)) : "PM"}</span>`
  ribbon.addEventListener("keydown", (e) => {
    if (!isTrustedActivation(e)) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      expandFromRibbon()
    }
  })
  makeRibbonDraggable(ribbon, expandFromRibbon)
  return ribbon
}

// Place the panel beside the ribbon so the morph reads as it growing out of the
// ribbon; from there the panel free-floats.
function anchorPanelBesideRibbon(): void {
  const panelW = 320
  const margin = 16
  const y = state.ribbonY ?? Math.round(window.innerHeight / 2 - RIBBON_H / 2)
  state.x =
    state.dock === "left"
      ? margin
      : Math.max(margin, window.innerWidth - panelW - margin)
  state.y = clampY(y)
}

// Manual open (tap/keyboard on the ribbon).
function expandFromRibbon(): void {
  anchorPanelBesideRibbon()
  state.collapsed = false
  pendingMorph = "expand"
  void saveState()
  render()
}

// One-shot auto-open when the verdict is genuinely notable. Flips state but does
// NOT render — the caller renders once afterwards.
function maybeAutoOpen(): void {
  if (autoOpenedForPage || userMinimized || !state.collapsed || !lastRisk) return
  if (lastRisk.level !== "high" && lastRisk.level !== "critical") return
  autoOpenedForPage = true
  anchorPanelBesideRibbon()
  state.collapsed = false
  pendingMorph = "expand"
  void saveState()
}

function buildPanel(): HTMLElement {
  const panel = document.createElement("div")
  panel.className = "panel"
  panel.setAttribute("data-cloak-dagger", "panel")
  panel.setAttribute("role", "dialog")
  panel.setAttribute("aria-label", "PrivacyMyst panel")

  const page = lastPage
  const header = document.createElement("div")
  header.className = "hdr"
  header.innerHTML = `
    <span class="dot" style="background:${LEVEL_COLOR[currentLevel()]}"></span>
    <span class="grow">
      <span class="ttl">PrivacyMyst</span><br/>
      <span class="sub">${escapeHtml(page ? describePage(page) : "skanuję…")}</span>
    </span>`
  const minBtn = iconButton("-", "Minimalizuj do wstazki", () => {
    state.collapsed = true
    userMinimized = true
    pendingMorph = "collapse"
    void saveState()
    render()
  })
  const closeBtn = iconButton("×", "Zamknij na tej karcie", () => {
    hostEl?.remove()
    hostEl = null
    shadow = null
  })
  header.appendChild(minBtn)
  header.appendChild(closeBtn)
  makeDraggable(header, panel)
  panel.appendChild(header)

  const body = document.createElement("div")
  body.className = "body"
  if (page?.excluded) {
    const ex = document.createElement("div")
    ex.className = "excluded"
    ex.textContent = `Skan wstrzymany: ${page.excludedReason ?? "strona wrażliwa"}. Treść nie jest czytana.`
    body.appendChild(ex)
  } else if (lastCards.length === 0) {
    const empty = document.createElement("div")
    empty.className = "status"
    empty.textContent = "Brak aktywnych kart dla tej strony."
    body.appendChild(empty)
  } else {
    for (const card of lastCards) body.appendChild(buildCard(card))
  }
  panel.appendChild(body)

  panel.appendChild(buildFooter(page))
  return panel
}

function buildCard(card: FeatureCard): HTMLElement {
  const el = document.createElement("div")
  el.className = "card"
  el.setAttribute("data-feature", card.featureId)
  el.style.borderLeftColor = LEVEL_COLOR[card.level]
  const score =
    typeof card.score === "number"
      ? `<span class="score" style="color:${LEVEL_COLOR[card.level]}">${card.score}</span>`
      : ""
  el.innerHTML = `
    <div class="top"><span class="name">${escapeHtml(card.title)}</span>${score}</div>
    ${card.lines.map((l) => `<div class="line">${escapeHtml(l)}</div>`).join("")}
    ${card.action ? `<div class="act">▸ ${escapeHtml(card.action)}</div>` : ""}
    <div class="src">źródło: ${escapeHtml(cardSourceLabel(card.source))}</div>`
  return el
}

function buildFooter(page: PageContext | null): HTMLElement {
  const ftr = document.createElement("div")
  ftr.className = "ftr"

  const model = getModelOption(lastConfig.selectedModelId)
  const status = document.createElement("div")
  status.className = "status" + (deepScanStatus === "error" ? " err" : "")
  status.setAttribute("data-cloak-dagger", "model-status")
  status.textContent = deepScanMessage || modelStatusLine(model)
  ftr.appendChild(status)

  if (shouldShowLlmOutput(model.task)) {
    ftr.appendChild(buildLlmOutputPanel())
  }

  if (!page?.excluded) {
    const deepBtn = document.createElement("button")
    deepBtn.className = "btn"
    deepBtn.textContent =
      deepScanStatus === "loading"
        ? "Ładowanie modelu…"
        : `Głęboki skan (${model.label.split(" (")[0]})`
    deepBtn.disabled = deepScanStatus === "loading"
    deepBtn.addEventListener("click", (event) => {
      if (!isTrustedActivation(event)) return
      void deepScan()
    })
    ftr.appendChild(deepBtn)
  }

  const sideBtn = document.createElement("button")
  sideBtn.className = "btn ghost"
  sideBtn.textContent = "Otwórz Side Panel"
  sideBtn.addEventListener("click", (event) => {
    if (!isTrustedActivation(event)) return
    try {
      ext?.runtime?.sendMessage({ type: "CND_OPEN_SIDE_PANEL" })
    } catch {
      /* SW may be asleep; best-effort */
    }
  })
  ftr.appendChild(sideBtn)

  const rescanBtn = document.createElement("button")
  rescanBtn.className = "btn ghost"
  rescanBtn.textContent = "Skanuj ponownie"
  rescanBtn.addEventListener("click", (event) => {
    if (!isTrustedActivation(event)) return
    deepScanStatus = "idle"
    deepScanMessage = ""
    llmOutputState = emptyLlmOutputState()
    scheduleAnalyze()
  })
  ftr.appendChild(rescanBtn)

  const visionBtn = document.createElement("button")
  visionBtn.className = "btn ghost"
  visionBtn.textContent = "Skanuj reklamy (AI vision)"
  visionBtn.title =
    "Wykryj i rozmyj obrazki-reklamy lokalnym modelem wizyjnym (skrót: Alt+Shift+V)"
  visionBtn.setAttribute("data-cloak-dagger", "vision-scan")
  visionBtn.addEventListener("click", (event) => {
    if (!isTrustedActivation(event)) return
    try {
      ext?.runtime?.sendMessage({ type: "CND_VISION_TRIGGER" })
    } catch {
      /* SW may be asleep; best-effort */
    }
  })
  ftr.appendChild(visionBtn)

  return ftr
}

function shouldShowLlmOutput(task: string): boolean {
  return task === "text-generation" || llmOutputState.active
}

function buildLlmOutputPanel(): HTMLElement {
  const box = document.createElement("div")
  box.className = "llmout" + (llmOutputState.error ? " err" : "")
  box.setAttribute("data-cloak-dagger", "llm-json-output")
  if (llmOutputState.insight) {
    box.setAttribute("data-verdict", llmOutputState.insight.verdict)
  }

  const phase = llmPhase()
  const head = document.createElement("div")
  head.className = "llmhead"
  head.title = llmRuntimeTitle()
  head.setAttribute("role", "button")
  head.setAttribute("aria-expanded", String(!llmCollapsed))
  head.innerHTML = `
    <span class="ttl">Głęboka analiza AI</span>
    <span class="llmphase" data-tone="${phase.tone}">${escapeHtml(phase.label)}</span>
    <button class="llmchev" type="button" aria-label="${llmCollapsed ? "Rozwiń" : "Zwiń"} analizę">${llmCollapsed ? "▸" : "▾"}</button>`
  head.addEventListener("click", () => {
    llmCollapsed = !llmCollapsed
    render()
  })
  box.appendChild(head)

  if (!llmCollapsed) {
    const body = document.createElement("div")
    body.className = "llmbody"
    if (llmOutputState.error) {
      body.appendChild(buildLlmErrorView())
    } else if (llmOutputState.insight) {
      body.appendChild(buildLlmInsightView(llmOutputState.insight))
    } else {
      body.appendChild(buildLlmLoadingView())
    }
    box.appendChild(body)
  }

  return box
}

// The deep-analysis region speaks in human phases, not pipeline stage names.
// Raw model/device/dtype/elapsed stay reachable via the header tooltip only.
function llmPhase(): { label: string; tone: "load" | "work" | "done" | "err" } {
  if (llmOutputState.error) return { label: "Błąd", tone: "err" }
  if (llmOutputState.insight) return { label: "Gotowe", tone: "done" }
  switch (llmOutputState.stage) {
    case "generating":
    case "stream-token":
      return { label: "Analiza treści", tone: "work" }
    case "model-loaded":
      return { label: "Model gotowy", tone: "work" }
    case "loading-model":
    case "model:progress":
      return { label: "Pobieranie modelu", tone: "load" }
    default:
      return { label: "Przygotowanie", tone: "load" }
  }
}

function llmRuntimeTitle(): string {
  const parts = [
    llmOutputState.modelId || lastConfig.selectedModelId,
    llmOutputState.device,
    llmOutputState.dtype
  ].filter(Boolean)
  if (typeof llmOutputState.elapsedMs === "number") {
    parts.push(`${Math.round(llmOutputState.elapsedMs / 1000)}s`)
  }
  return parts.join(" · ")
}

function buildLlmInsightView(insight: LlmInsightView): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "llminsight"
  wrap.setAttribute("data-cloak-dagger", "llm-insight")

  const color = LEVEL_COLOR[insight.verdict]
  const hero = document.createElement("div")
  hero.className = "llmhero"
  hero.innerHTML = `
    <div>
      <div class="llmkicker">Wniosek lokalnego modelu</div>
      <div class="llmverdict">Ryzyko: ${escapeHtml(formatVerdictLabel(insight.verdict))}</div>
    </div>
    <div class="llmscore" style="color:${color}">${insight.score}</div>
  `
  wrap.appendChild(hero)
  wrap.appendChild(buildScoreBar(insight.score, color))

  const reason = document.createElement("div")
  reason.className = "llmreason"
  reason.textContent = insight.reason
  wrap.appendChild(reason)

  const chips = document.createElement("div")
  chips.className = "llmchips"
  if (insight.sensitiveSignals.length > 0) {
    for (const signal of insight.sensitiveSignals) {
      chips.appendChild(buildSignalChip(signal))
    }
  } else {
    const chip = document.createElement("span")
    chip.className = "llmchip"
    chip.textContent = "brak jawnych sygnałów w odpowiedzi modelu"
    chips.appendChild(chip)
  }
  wrap.appendChild(chips)

  const risks = document.createElement("div")
  risks.className = "llmrisks"
  risks.appendChild(buildRiskRow("Profilowanie", insight.profilingRisk, color))
  risks.appendChild(buildRiskRow("Manipulacja", insight.manipulationRisk, "#E6B450"))
  wrap.appendChild(risks)

  const foot = document.createElement("div")
  foot.className = "llmfoot"
  foot.textContent = `źródło: lokalny LLM · ${modelRuntimeLine()}`
  wrap.appendChild(foot)

  return wrap
}

function buildLlmErrorView(): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "llminsight"
  const title = document.createElement("div")
  title.className = "llmverdict"
  title.style.color = "#FF7A66"
  title.textContent = "Wniosek LLM niedostępny"
  wrap.appendChild(title)

  const body = document.createElement("div")
  body.className = "llmreason"
  body.textContent = llmOutputState.error
  wrap.appendChild(body)

  const foot = document.createElement("div")
  foot.className = "llmfoot"
  foot.textContent = modelRuntimeLine()
  wrap.appendChild(foot)

  return wrap
}

function buildLlmLoadingView(): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "llminsight"

  const isDownload =
    llmOutputState.stage === "model:progress" ||
    llmOutputState.stage === "loading-model"
  const pct =
    isDownload && typeof llmOutputState.progress === "number"
      ? llmOutputState.progress
      : null

  const msg = document.createElement("div")
  msg.className = "llmloading"
  const label = document.createElement("span")
  label.textContent = loadingMessageForStage(llmOutputState.stage)
  msg.appendChild(label)
  if (pct !== null) {
    const pctEl = document.createElement("span")
    pctEl.className = "pct"
    pctEl.textContent = `${pct}%`
    msg.appendChild(pctEl)
  }
  wrap.appendChild(msg)

  const bar = document.createElement("div")
  bar.className = "llmprog" + (pct === null ? " indet" : "")
  const fill = document.createElement("span")
  if (pct !== null) fill.style.width = `${pct}%`
  bar.appendChild(fill)
  wrap.appendChild(bar)
  return wrap
}

function buildSignalChip(signal: LlmInsightSignal): HTMLElement {
  const chip = document.createElement("span")
  chip.className = "llmchip"
  chip.title = signal.evidence ?? signal.label
  const evidence = signal.evidence ? ` · ${signal.evidence}` : ""
  chip.innerHTML = `<strong>${signal.score}</strong> ${escapeHtml(signal.label)}${escapeHtml(evidence)}`
  return chip
}

function buildRiskRow(label: string, value: number, color: string): HTMLElement {
  const row = document.createElement("div")
  row.className = "llmrisk"
  const name = document.createElement("span")
  name.textContent = label
  const valueText = document.createElement("span")
  valueText.textContent = String(value)
  row.appendChild(name)
  row.appendChild(buildScoreBar(value, color))
  row.appendChild(valueText)
  return row
}

function buildScoreBar(value: number, color: string): HTMLElement {
  const bar = document.createElement("div")
  bar.className = "llmbar"
  const fill = document.createElement("span")
  fill.style.width = `${Math.max(0, Math.min(100, Math.round(value)))}%`
  fill.style.background = color
  bar.appendChild(fill)
  return bar
}

function loadingMessageForStage(stage: string): string {
  if (stage === "stream-token" || stage === "generating")
    return "Analizuję treść strony…"
  if (stage === "model-loaded") return "Model gotowy, analizuję stronę…"
  if (stage === "loading-model" || stage === "model:progress")
    return "Pobieram model (pierwsze użycie)…"
  return "Przygotowuję lokalny model…"
}

function modelRuntimeLine(): string {
  const model = llmOutputState.modelId || lastConfig.selectedModelId
  const runtime = [llmOutputState.device, llmOutputState.dtype]
    .filter(Boolean)
    .join("/")
  return runtime ? `${model} · ${runtime}` : model
}

function cardSourceLabel(source: FeatureCard["source"]): string {
  if (source === "llm-json") return "lokalny LLM"
  if (source === "nli") return "lokalny NLI"
  if (source === "heuristic") return "heurystyka"
  if (source === "static") return "statyczne"
  return "łączone"
}

function modelStatusLine(model: { label: string; approxDownloadMb: number; localModelId?: string }): string {
  const verdict = modelModeLabel(lastRisk?.model?.mode)
  return `Werdykt: ${verdict} · model lokalny: ${model.label.split(" (")[0]}`
}

function modelModeLabel(mode: string | undefined): string {
  if (mode === "heuristic+llm-json") return "lokalny LLM"
  if (mode === "heuristic+nli") return "lokalny NLI"
  return "heurystyka"
}

// ---------------------------------------------------------------------------
// Analysis (local-first, honest about inference path)
// ---------------------------------------------------------------------------

let lastPage: PageContext | null = null
let lastCards: FeatureCard[] = []
let lastConfig: AiDeepDiveRuntimeConfig = { ...DEFAULT_AI_DEEP_DIVE_CONFIG }

function scheduleAnalyze(): void {
  if (rerenderQueued) return
  rerenderQueued = true
  setTimeout(() => {
    rerenderQueued = false
    void analyze()
  }, 150)
}

async function analyze(): Promise<void> {
  lastConfig = await loadAiConfig()
  const page = buildPageContext()
  lastPage = page

  if (page.excluded) {
    lastRisk = null
    lastCards = []
    render()
    return
  }

  const heuristic = classifyHeuristic(extractVisibleTextFromPage())
  lastRisk = heuristic
  lastCards = sortCards(runActiveFeatures({ page, risk: heuristic }))
  maybeAutoOpen()
  render()
  pushAnalysis()
}

function sourceFromRisk(): PageAnalysis["source"] {
  const mode = lastRisk?.model?.mode
  if (mode === "heuristic+llm-json") return "llm-json"
  if (mode === "heuristic+nli") return "nli"
  return "heuristic"
}

// Push the current analysis to the service worker so the side panel can render
// the same current-page verdict. Only page-derived, non-secret data is sent.
function pushAnalysis(): void {
  if (!lastPage) return
  const analysis: PageAnalysis = {
    page: lastPage,
    cards: lastCards,
    source: sourceFromRisk(),
    modelId: lastConfig.selectedModelId,
    capturedAt: Date.now()
  }
  try {
    ext?.runtime?.sendMessage({ type: "CND_ANALYSIS_UPDATED", analysis })
  } catch {
    /* SW asleep; best-effort */
  }
}

async function deepScan(): Promise<void> {
  if (!lastConfig.aiModeEnabled) {
    deepScanStatus = "disabled"
    deepScanMessage = "Model wyłączony  -  włącz AI Deep-Dive w popupie."
    render()
    return
  }
  const model = getModelOption(lastConfig.selectedModelId)
  deepScanStatus = "loading"
  deepScanMessage = model.localModelId
    ? "Uruchamiam głęboką analizę (model lokalny)…"
    : `Uruchamiam głęboką analizę (pierwsze użycie pobiera ~${formatModelSize(model.approxDownloadMb)})…`
  resetLlmOutput(model.id)
  render()

  const input = extractVisibleTextFromPage()
  const requestId = crypto.randomUUID()
  activeDeepScanRequestId = requestId
  const { result, error } = await requestDeepScan(input, lastConfig, requestId)
  if (result) {
    lastRisk = result
    lastCards = sortCards(
      runActiveFeatures({ page: lastPage ?? buildPageContext(), risk: result })
    )
    deepScanStatus = "done"
    deepScanMessage = ""
    activeDeepScanRequestId = null
    if (model.task === "text-generation") {
      llmOutputState = {
        ...llmOutputState,
        active: true,
        stage: "done",
        insight:
          llmOutputState.insight ?? buildLlmInsightFromRiskResult(result)
      }
    }
  } else {
    deepScanStatus = "error"
    deepScanMessage = deepScanMessage.startsWith("Błąd LLM")
      ? deepScanMessage
      : `Błąd modelu: ${error ?? "nieznany"}. Werdykt pozostaje heurystyczny.`
    llmOutputState = {
      ...llmOutputState,
      active: model.task === "text-generation" || llmOutputState.active,
      error: llmOutputState.error || String(error ?? "nieznany błąd modelu")
    }
    activeDeepScanRequestId = null
  }
  maybeAutoOpen()
  render()
  pushAnalysis()
}

function installDeepScanStatusListener(): void {
  if (deepScanStatusListenerInstalled) return
  deepScanStatusListenerInstalled = true
  try {
    ext?.runtime?.onMessage?.addListener?.((message: unknown) => {
      const record = message as {
        type?: string
        status?: RuntimeStatusRecord
      }
      if (record?.type !== "CND_DEEP_SCAN_STATUS" || !record.status) return
      const requestId = record.status.requestId
      if (!activeDeepScanRequestId) return
      if (typeof requestId === "string" && requestId !== activeDeepScanRequestId) return
      updateLlmOutput(record.status)
      const stage = String(record.status.stage ?? "unknown")
      deepScanMessage = humanDeepScanStatus(record.status)
      deepScanStatus = stage === "failed" || stage === "infer:error" ? "error" : "loading"
      render()
    })
  } catch {
    /* Status telemetry is diagnostic; inference still returns final response. */
  }
}

function emptyLlmOutputState(): LlmOutputState {
  return {
    active: false,
    stage: "",
    modelId: "",
    device: "",
    dtype: "",
    elapsedMs: null,
    progress: null,
    insight: null,
    error: ""
  }
}

function resetLlmOutput(modelId: string): void {
  llmOutputState = {
    ...emptyLlmOutputState(),
    active: true,
    stage: "starting",
    modelId
  }
}

function updateLlmOutput(status: RuntimeStatusRecord): void {
  if (!shouldTrackLlmOutput(status)) return

  const stage = String(status.stage ?? "unknown")
  const next: LlmOutputState = {
    ...llmOutputState,
    active: true,
    stage,
    modelId: String(status.modelId ?? status.selectedModelId ?? llmOutputState.modelId),
    device: String(status.device ?? llmOutputState.device),
    dtype: String(status.selectedDtype ?? status.dtype ?? llmOutputState.dtype),
    elapsedMs:
      typeof status.elapsedMs === "number"
        ? status.elapsedMs
        : llmOutputState.elapsedMs,
    progress:
      stage === "model:progress" && typeof status.progress === "number"
        ? Math.max(0, Math.min(100, Math.round(status.progress)))
        : stage === "model-loaded" ||
            stage === "generating" ||
            stage === "stream-token"
          ? null
          : llmOutputState.progress
  }

  if (stage === "failed" || stage === "infer:error") {
    next.error = runtimeErrorMessage(status)
  }

  llmOutputState = next
}

function shouldTrackLlmOutput(status: RuntimeStatusRecord): boolean {
  if (llmOutputState.active) return true
  const selected = String(status.selectedModelId ?? "")
  if (selected && getModelOption(selected).task === "text-generation") return true
  const modelId = String(status.modelId ?? "")
  return /granite|gemma|llm/i.test(modelId)
}

// Footer status line, in plain language. The full runtime trace (stage, dtype,
// device, files) still lands in the offscreen logs for diagnostics  -  it just
// doesn't get dumped at the user here.
function humanDeepScanStatus(status: Record<string, unknown>): string {
  const stage = String(status.stage ?? "unknown")
  if (stage === "failed" || stage === "infer:error") {
    return `Błąd analizy: ${runtimeErrorMessage(status)}. Werdykt pozostaje heurystyczny.`
  }
  if (stage === "model:progress" || stage === "loading-model") {
    const pct =
      typeof status.progress === "number"
        ? ` ${Math.round(status.progress)}%`
        : ""
    return `Pobieram model lokalny…${pct}`
  }
  switch (stage) {
    case "model-loaded":
      return "Model gotowy, analizuję stronę…"
    case "generating":
    case "stream-token":
    case "generated":
      return "Analizuję treść strony…"
    default:
      return "Przygotowuję lokalny model…"
  }
}

function formatModelSize(mb: number): string {
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`
}

function runtimeErrorMessage(status: Record<string, unknown>): string {
  const error = status.error
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
  }
  return "nieznany błąd runtime"
}

// ---------------------------------------------------------------------------
// SPA survival + selection
// ---------------------------------------------------------------------------

function installSpaSurvival(): void {
  const onChange = () => {
    if (!document.getElementById(HOST_ID)) mountHost()
    deepScanStatus = "idle"
    deepScanMessage = ""
    llmOutputState = emptyLlmOutputState()
    scheduleAnalyze()
  }
  // History API hooks (SPA route changes don't fire popstate on push).
  for (const m of ["pushState", "replaceState"] as const) {
    const orig = history[m]
    history[m] = function (this: History, ...args: unknown[]) {
      const out = (orig as (...a: unknown[]) => unknown).apply(this, args)
      window.dispatchEvent(new Event("cnd:locationchange"))
      return out
    } as History[typeof m]
  }
  window.addEventListener("popstate", onChange)
  window.addEventListener("cnd:locationchange", onChange)

  // Re-attach host if the page nukes our node (some SPAs replace <body>).
  const observer = new MutationObserver(() => {
    if (!document.getElementById(HOST_ID) && !state.disabled) mountHost()
  })
  observer.observe(document.documentElement, { childList: true, subtree: false })
}

function installSelectionWatcher(): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  document.addEventListener("selectionchange", () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const text = window.getSelection?.()?.toString().trim() ?? ""
      if (text.length >= 12 && lastPage && !lastPage.excluded) {
        lastPage = { ...lastPage, selectedText: text }
        // Surface the selection in the panel header subtext only; full Selection
        // Assistant actions are a documented next patch.
        if (!state.collapsed) render()
      }
    }, 400)
  })
}

// ---------------------------------------------------------------------------
// Drag
// ---------------------------------------------------------------------------

function makeDraggable(handle: HTMLElement, moving: HTMLElement): void {
  let startX = 0
  let startY = 0
  let originLeft = 0
  let originTop = 0
  let dragging = false
  let moved = false

  handle.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0 || !isTrustedActivation(e)) return
    dragging = true
    moved = false
    const widget = moving.classList.contains("widget")
      ? moving
      : (moving.closest(".widget") as HTMLElement) || moving
    const rect = widget.getBoundingClientRect()
    originLeft = rect.left
    originTop = rect.top
    startX = e.clientX
    startY = e.clientY
    handle.setPointerCapture(e.pointerId)
  })
  handle.addEventListener("pointermove", (e: PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true
    const widget =
      (moving.closest(".widget") as HTMLElement) ||
      (moving.classList.contains("widget") ? moving : null)
    if (!widget) return
    widget.style.left = `${clampX(originLeft + dx)}px`
    widget.style.top = `${clampY(originTop + dy)}px`
    widget.style.right = "auto"
    widget.style.bottom = "auto"
  })
  handle.addEventListener("pointerup", (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    handle.releasePointerCapture(e.pointerId)
    if (moved) {
      const widget =
        (moving.closest(".widget") as HTMLElement) ||
        (moving.classList.contains("widget") ? moving : null)
      if (widget) {
        const rect = widget.getBoundingClientRect()
        state.x = rect.left
        state.y = rect.top
        void saveState()
      }
    }
  })
}

function clampX(x: number): number {
  return Math.max(0, Math.min(x, window.innerWidth - 56))
}
function clampY(y: number): number {
  return Math.max(0, Math.min(y, window.innerHeight - 56))
}
function clampRibbonY(y: number): number {
  return Math.max(8, Math.min(y, window.innerHeight - RIBBON_H - 8))
}

// Ribbon drag: 1:1 free follow while dragging, then a spring-snap to the nearest
// vertical edge on release. A tap (no real movement) activates the panel instead.
function makeRibbonDraggable(el: HTMLElement, onActivate: () => void): void {
  let startX = 0
  let startY = 0
  let originLeft = 0
  let originTop = 0
  let dragging = false
  let moved = false

  const widgetOf = (): HTMLElement =>
    (el.closest(".widget") as HTMLElement) || el

  el.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0 || !isTrustedActivation(e)) return
    dragging = true
    moved = false
    const widget = widgetOf()
    const rect = widget.getBoundingClientRect()
    originLeft = rect.left
    originTop = rect.top
    startX = e.clientX
    startY = e.clientY
    widget.classList.remove("snapping")
    widget.classList.add("dragging")
    el.setPointerCapture(e.pointerId)
  })

  el.addEventListener("pointermove", (e: PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true
    const widget = widgetOf()
    widget.style.left = `${originLeft + dx}px`
    widget.style.top = `${clampRibbonY(originTop + dy)}px`
    widget.style.right = "auto"
    widget.style.bottom = "auto"
  })

  el.addEventListener("pointerup", (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer capture may already be released */
    }
    const widget = widgetOf()
    widget.classList.remove("dragging")

    // A tap opens the panel rather than re-docking.
    if (!moved) {
      if (!isTrustedActivation(e)) return
      onActivate()
      return
    }

    // Snap to the nearest vertical edge. The back-eased transition slightly
    // overshoots past the edge (clipped by the viewport) for a "press into the
    // edge" spring feel.
    const rect = widget.getBoundingClientRect()
    const center = rect.left + rect.width / 2
    state.dock = center < window.innerWidth / 2 ? "left" : "right"
    state.ribbonY = clampRibbonY(rect.top)
    el.className = `ribbon dock-${state.dock}`

    widget.classList.add("snapping")
    widget.style.top = `${state.ribbonY}px`
    widget.style.right = "auto"
    widget.style.left =
      state.dock === "left" ? "0px" : `${window.innerWidth - rect.width}px`

    let done = false
    const settle = (): void => {
      if (done) return
      done = true
      widget.classList.remove("snapping")
      // Re-anchor via right/left:0 so the ribbon tracks future window resizes.
      positionWidget(widget)
      widget.removeEventListener("transitionend", onEnd)
    }
    const onEnd = (ev: Event): void => {
      if ((ev as TransitionEvent).propertyName === "left") settle()
    }
    widget.addEventListener("transitionend", onEnd)
    window.setTimeout(settle, 440) // fallback if no left-transition fires
    void saveState()
  })
}

// ---------------------------------------------------------------------------
// State + config storage
// ---------------------------------------------------------------------------

function loadState(): Promise<FloatingState> {
  return new Promise((resolve) => {
    if (!ext?.storage?.local) return resolve({ ...DEFAULT_STATE })
    try {
      ext.storage.local.get(STORAGE_KEY_FLOATING, (res) => {
        const all = (res?.[STORAGE_KEY_FLOATING] ?? {}) as Record<string, FloatingState>
        resolve({ ...DEFAULT_STATE, ...(all[location.origin] ?? {}) })
      })
    } catch {
      resolve({ ...DEFAULT_STATE })
    }
  })
}

function saveState(): Promise<void> {
  return new Promise((resolve) => {
    if (!ext?.storage?.local) return resolve()
    try {
      ext.storage.local.get(STORAGE_KEY_FLOATING, (res) => {
        const all = (res?.[STORAGE_KEY_FLOATING] ?? {}) as Record<string, FloatingState>
        all[location.origin] = state
        ext.storage.local.set({ [STORAGE_KEY_FLOATING]: all }, () => resolve())
      })
    } catch {
      resolve()
    }
  })
}

function loadAiConfig(): Promise<AiDeepDiveRuntimeConfig> {
  return new Promise((resolve) => {
    if (!ext?.storage?.local) return resolve({ ...DEFAULT_AI_DEEP_DIVE_CONFIG })
    try {
      ext.storage.local.get(STORAGE_KEY_AI_DEEP_DIVE_CONFIG, (res) => {
        resolve(
          normalizeAiDeepDiveConfig(
            res?.[STORAGE_KEY_AI_DEEP_DIVE_CONFIG] as
              | Partial<AiDeepDiveRuntimeConfig>
              | undefined
          )
        )
      })
    } catch {
      resolve({ ...DEFAULT_AI_DEEP_DIVE_CONFIG })
    }
  })
}

function iconButton(
  label: string,
  aria: string,
  onClick: () => void
): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.className = "iconbtn"
  btn.type = "button"
  btn.textContent = label
  btn.setAttribute("aria-label", aria)
  btn.title = aria
  btn.addEventListener("click", (event) => {
    if (!isTrustedActivation(event)) return
    onClick()
  })
  return btn
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
