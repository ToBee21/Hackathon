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
import { registerFeature } from "../shared/featureRegistry"
import type { DeepScanRuntimeStatus, PageAnalysis } from "../shared/messages"
import { describePage, type PageContext } from "../shared/pageContextSchema"
import { extractVisibleTextFromPage } from "./aiDeepDive/extractVisibleText"
import { buildPageContext } from "./pageContext"

const HOST_ID = "cloak-dagger-floating-root"
const STORAGE_KEY_FLOATING = "cnd:floating"
const ext = globalThis.chrome

interface FloatingState {
  collapsed: boolean
  x: number | null
  y: number | null
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
  disabled: false
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

export async function initFloatingWindow(): Promise<void> {
  if (window.top !== window) return
  if (!document.body && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void initFloatingWindow(), {
      once: true
    })
    return
  }

  state = await loadState()
  if (state.disabled) return

  mountHost()
  installDeepScanStatusListener()
  scheduleAnalyze()
  installSpaSurvival()
  installSelectionWatcher()
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
    .widget { position: fixed; pointer-events: auto; }
    .bubble {
      width: 48px; height: 48px; border-radius: 50%;
      background: #0E1116; color: #2BD4C4; border: 1px solid #2BD4C4;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; box-shadow: 0 8px 28px rgba(0,0,0,0.45);
      font-size: 18px; font-weight: 700; user-select: none;
    }
    .bubble[data-level="critical"], .bubble[data-level="high"] { border-color: #FF5C77; color: #FF5C77; }
    .bubble[data-level="medium"] { border-color: #E6B450; color: #E6B450; }
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
    widget.appendChild(buildBubble())
  } else {
    widget.appendChild(buildPanel())
  }
  shadow.appendChild(widget)
}

function positionWidget(widget: HTMLElement): void {
  if (state.x !== null && state.y !== null) {
    widget.style.left = `${clampX(state.x)}px`
    widget.style.top = `${clampY(state.y)}px`
  } else {
    widget.style.right = "20px"
    widget.style.bottom = "20px"
  }
}

function buildBubble(): HTMLElement {
  const bubble = document.createElement("div")
  bubble.className = "bubble"
  bubble.setAttribute("data-cloak-dagger", "bubble")
  bubble.setAttribute("data-level", currentLevel())
  bubble.setAttribute("role", "button")
  bubble.setAttribute("tabindex", "0")
  bubble.setAttribute(
    "aria-label",
    `Cloak & Dagger  -  ${lastRisk ? `ryzyko ${lastRisk.score}` : "otwórz panel"}`
  )
  bubble.textContent = lastRisk ? String(lastRisk.score) : "CD"
  const open = () => {
    state.collapsed = false
    void saveState()
    render()
  }
  bubble.addEventListener("click", open)
  bubble.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      open()
    }
  })
  makeDraggable(bubble, bubble)
  return bubble
}

function buildPanel(): HTMLElement {
  const panel = document.createElement("div")
  panel.className = "panel"
  panel.setAttribute("data-cloak-dagger", "panel")
  panel.setAttribute("role", "dialog")
  panel.setAttribute("aria-label", "Cloak & Dagger panel")

  const page = lastPage
  const header = document.createElement("div")
  header.className = "hdr"
  header.innerHTML = `
    <span class="dot" style="background:${LEVEL_COLOR[currentLevel()]}"></span>
    <span class="grow">
      <span class="ttl">Cloak &amp; Dagger</span><br/>
      <span class="sub">${escapeHtml(page ? describePage(page) : "skanuję…")}</span>
    </span>`
  const minBtn = iconButton("-", "Minimalizuj", () => {
    state.collapsed = true
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
    deepBtn.addEventListener("click", () => void deepScan())
    ftr.appendChild(deepBtn)
  }

  const sideBtn = document.createElement("button")
  sideBtn.className = "btn ghost"
  sideBtn.textContent = "Otwórz Side Panel"
  sideBtn.addEventListener("click", () => {
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
  rescanBtn.addEventListener("click", () => {
    deepScanStatus = "idle"
    deepScanMessage = ""
    llmOutputState = emptyLlmOutputState()
    scheduleAnalyze()
  })
  ftr.appendChild(rescanBtn)

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
    if (e.button !== 0) return
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
  btn.addEventListener("click", onClick)
  return btn
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
