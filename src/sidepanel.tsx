// src/sidepanel.tsx
// The serious long-running companion surface (chrome.sidePanel). Renders the
// SAME current-page analysis the floating window computed, plus richer settings
// and model status. It reads cnd:last-analysis (pushed by the content script via
// the service worker) for the active tab.
//
// Why heavier workflows live here and not in the page overlay: this is a
// chrome-extension:// surface the host page cannot read  -  the right place for
// confidential rendering, unlike the in-page Shadow DOM bubble.

import { useEffect, useState, type CSSProperties } from "react"

import {
  AI_DEEP_DIVE_MODELS,
  getModelOption
} from "./shared/aiDeepDive/models"
import {
  DEFAULT_AI_DEEP_DIVE_CONFIG,
  STORAGE_KEY_AI_DEEP_DIVE_CONFIG,
  normalizeAiDeepDiveConfig,
  type AiDeepDiveRuntimeConfig
} from "./shared/aiDeepDive/config"
import type { CardLevel, FeatureCard } from "./shared/featureRegistry"
import {
  inspectFileBytes,
  type FileInspectVerdict
} from "./shared/fileInspect/inspectFile"
import type { PageAnalysis } from "./shared/messages"
import { STORAGE_KEYS } from "./shared/storageKeys"
import { describePage } from "./shared/pageContextSchema"

const ext: typeof chrome | undefined = (globalThis as { chrome?: typeof chrome }).chrome

const LEVEL_COLOR: Record<CardLevel, string> = {
  critical: "#FF5C77",
  high: "#FF7A66",
  medium: "#E6B450",
  low: "#2BD4C4",
  info: "#9AA4B2"
}

const wrap: CSSProperties = {
  background: "#0A0B0E",
  color: "#C7D2DA",
  minHeight: "100vh",
  fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
  padding: 14
}

function readAnalysisForActiveTab(): Promise<PageAnalysis | null> {
  return new Promise((resolve) => {
    if (!ext?.storage?.local || !ext?.tabs) return resolve(null)
    ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id
      ext!.storage.local.get(STORAGE_KEYS.lastAnalysis, (res) => {
        const all = (res?.[STORAGE_KEYS.lastAnalysis] ?? {}) as Record<string, PageAnalysis>
        const byTab = typeof tabId === "number" ? all[String(tabId)] : undefined
        // Fall back to the most recent analysis if no per-tab entry yet.
        const latest =
          byTab ??
          Object.values(all).sort((a, b) => b.capturedAt - a.capturedAt)[0] ??
          null
        resolve(latest)
      })
    })
  })
}

export default function SidePanel() {
  const [analysis, setAnalysis] = useState<PageAnalysis | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const refresh = () =>
      readAnalysisForActiveTab().then((a) => {
        if (alive) {
          setAnalysis(a)
          setLoading(false)
        }
      })
    refresh()

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[STORAGE_KEYS.lastAnalysis]) refresh()
    }
    ext?.storage?.onChanged?.addListener(onChanged)
    const onActivated = () => refresh()
    ext?.tabs?.onActivated?.addListener(onActivated)
    return () => {
      alive = false
      ext?.storage?.onChanged?.removeListener(onChanged)
      ext?.tabs?.onActivated?.removeListener(onActivated)
    }
  }, [])

  const model = getModelOption(analysis?.modelId)

  return (
    <div style={wrap}>
      <header style={{ borderBottom: "1px solid #1c2b36", paddingBottom: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#2BD4C4", textTransform: "uppercase" }}>
          PrivacyMyst
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#E6EDF3" }}>Page Audit</div>
        <div style={{ fontSize: 11, color: "#6b7a85", marginTop: 2 }}>
          {analysis ? describePage(analysis.page) : loading ? "ładowanie…" : "brak analizy aktywnej karty"}
        </div>
      </header>

      <ModelPicker />

      <section
        style={{
          border: "1px solid #1c2b36",
          borderRadius: 10,
          padding: "8px 10px",
          marginBottom: 12,
          fontSize: 11
        }}>
        <div style={{ fontSize: 10, color: "#6b7a85", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Ostatni skan
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#9AA4B2" }}>Tryb inferencji</span>
          <span style={{ color: "#2BD4C4", fontWeight: 600 }}>
            {analysis?.source ?? "heuristic"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ color: "#9AA4B2" }}>Model</span>
          <span style={{ color: "#C7D2DA" }}>{model.label.split(" (")[0]}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ color: "#9AA4B2" }}>Rozmiar / licencja</span>
          <span style={{ color: "#6b7a85" }}>
            ~{model.approxDownloadMb} MB · {model.localModelId ? "pakiet extension" : model.license}
          </span>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: "#2BD4C4" }}>
          local-first · cloud disabled · dane nie opuszczają urządzenia
        </div>
      </section>

      {analysis?.page.excluded && (
        <div style={{ color: "#E6B450", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
          Skan wstrzymany: {analysis.page.excludedReason}. Treść strony nie jest czytana.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(analysis?.cards ?? []).map((card) => (
          <Card key={card.featureId} card={card} />
        ))}
        {analysis && analysis.cards.length === 0 && !analysis.page.excluded && (
          <div style={{ fontSize: 11, color: "#6b7a85" }}>Brak aktywnych kart dla tej strony.</div>
        )}
      </div>

      <FileInspector />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wybór modelu AI (opcjonalny). Steruje tym, CZY ciężkie modele NLI/LLM w ogóle
// się ładują i zajmują GPU/CPU. „Wyłączony" = tylko lokalna heurystyka, zero modelu.
// Zapisuje cnd:ai-deep-dive:config — ten sam kontrakt, który czytają content +
// offscreen (gate.ts: !aiModeEnabled => żaden model nie startuje). Globalny dla
// całego LLM-a, nie per-karta. Reaguje też na zmiany z popupu/dashboardu.
// ---------------------------------------------------------------------------

const OFF_VALUE = "__off__"

function ModelPicker() {
  const [config, setConfig] = useState<AiDeepDiveRuntimeConfig>(DEFAULT_AI_DEEP_DIVE_CONFIG)

  useEffect(() => {
    if (!ext?.storage?.local) return
    const read = () =>
      ext!.storage.local.get(STORAGE_KEY_AI_DEEP_DIVE_CONFIG, (res) => {
        setConfig(
          normalizeAiDeepDiveConfig(
            res?.[STORAGE_KEY_AI_DEEP_DIVE_CONFIG] as Partial<AiDeepDiveRuntimeConfig> | undefined
          )
        )
      })
    read()
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[STORAGE_KEY_AI_DEEP_DIVE_CONFIG]) read()
    }
    ext.storage.onChanged?.addListener(onChanged)
    return () => ext?.storage?.onChanged?.removeListener(onChanged)
  }, [])

  const selectValue = config.aiModeEnabled ? config.selectedModelId : OFF_VALUE
  const activeModel = config.aiModeEnabled ? getModelOption(config.selectedModelId) : null
  const needsGpu = activeModel?.task === "text-generation"

  function apply(value: string) {
    const next: AiDeepDiveRuntimeConfig =
      value === OFF_VALUE
        ? { ...config, aiModeEnabled: false }
        : { ...config, aiModeEnabled: true, selectedModelId: value }
    const normalized = normalizeAiDeepDiveConfig(next)
    setConfig(normalized)
    ext?.storage?.local?.set({ [STORAGE_KEY_AI_DEEP_DIVE_CONFIG]: normalized })
  }

  return (
    <section
      style={{
        border: "1px solid #1c2b36",
        borderRadius: 10,
        padding: "10px 10px 12px",
        marginBottom: 12
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.14em", color: "#2BD4C4", textTransform: "uppercase" }}>
          Silnik AI · wybór modelu
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: config.aiModeEnabled ? "#2BD4C4" : "#6b7a85" }}>
          {config.aiModeEnabled ? "AKTYWNY" : "WYŁĄCZONY"}
        </span>
      </div>

      <select
        value={selectValue}
        onChange={(e) => apply(e.target.value)}
        aria-label="Wybór lokalnego modelu AI"
        style={{
          width: "100%",
          background: "#0E1014",
          color: "#E6EDF3",
          border: "1px solid #283644",
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 12,
          cursor: "pointer"
        }}>
        <option value={OFF_VALUE}>Wyłączony — tylko heurystyka (0 modelu, 0 GPU)</option>
        {AI_DEEP_DIVE_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label.split(" (")[0]} · ~{m.approxDownloadMb} MB
          </option>
        ))}
      </select>

      <div style={{ fontSize: 10, color: "#6b7a85", marginTop: 8, lineHeight: 1.5 }}>
        Steruje tym, czy ciężkie modele zajmują GPU/CPU. „Wyłączony" = żaden model się nie
        ładuje, działa tylko lokalna heurystyka.
      </div>

      {activeModel && (
        <div
          style={{
            marginTop: 8,
            borderTop: "1px solid #14202a",
            paddingTop: 8,
            fontSize: 10.5,
            color: "#C7D2DA",
            lineHeight: 1.5
          }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#9AA4B2" }}>Compute</span>
            <span style={{ color: needsGpu ? "#E6B450" : "#2BD4C4" }}>
              {needsGpu ? "WebGPU (cięższy)" : "CPU / WASM (lekki)"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            <span style={{ color: "#9AA4B2" }}>Rozmiar / licencja</span>
            <span style={{ color: "#6b7a85" }}>
              ~{activeModel.approxDownloadMb} MB · {activeModel.license}
            </span>
          </div>
          {activeModel.note && <div style={{ marginTop: 5, color: "#8b97a3" }}>{activeModel.note}</div>}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Stage-1 File Inspector — lokalna inspekcja STRUKTURY pobranego pliku.
// Bajty czytane przez FileReader (arrayBuffer); plik NIE opuszcza urządzenia,
// żadnego fetcha — zero-network. To nie antywirus: wykrywamy niebezpieczną
// strukturę (auto-uruchamianie, makra, niezgodność typu, polyglot).
// ---------------------------------------------------------------------------

function FileInspector() {
  const [verdict, setVerdict] = useState<FileInspectVerdict | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    try {
      const buf = await file.arrayBuffer()
      setVerdict(inspectFileBytes(file.name, new Uint8Array(buf)))
    } finally {
      setBusy(false)
    }
  }

  const color = verdict ? LEVEL_COLOR[verdict.level] : "#2BD4C4"

  return (
    <section style={{ marginTop: 14, borderTop: "1px solid #1c2b36", paddingTop: 12 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "#2BD4C4", textTransform: "uppercase" }}>
        Inspekcja pliku · Stage 1
      </div>
      <div style={{ fontSize: 10, color: "#6b7a85", margin: "3px 0 8px" }}>
        Upuść pobrany załącznik. Czytany lokalnie (FileReader), nie opuszcza urządzenia.
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) void handleFile(f)
        }}
        style={{
          display: "block",
          border: `1px dashed ${dragOver ? "#2BD4C4" : "#283644"}`,
          borderRadius: 10,
          padding: "16px 12px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "rgba(43,212,196,0.06)" : "rgba(255,255,255,0.015)",
          fontSize: 11,
          color: "#9AA4B2"
        }}>
        {busy ? "Analizuję strukturę…" : "Upuść plik tutaj lub kliknij, by wybrać"}
        <input
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
      </label>

      {verdict && (
        <div
          style={{
            marginTop: 10,
            border: "1px solid #1c2b36",
            borderLeft: `3px solid ${color}`,
            borderRadius: 8,
            padding: "8px 10px",
            background: "rgba(255,255,255,0.02)"
          }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#E6EDF3", overflowWrap: "anywhere" }}>
              {verdict.filename}
            </span>
            <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 14, fontWeight: 700, color }}>
              {verdict.score}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#C7D2DA", marginTop: 4, lineHeight: 1.4 }}>
            {verdict.summary}
          </div>
          <div style={{ fontSize: 10, color: "#6b7a85", marginTop: 4 }}>
            typ wykryty: {verdict.detectedType ?? "nierozpoznany"} · rozszerzenie: .{verdict.declaredExtension || "?"} ·{" "}
            {(verdict.sizeBytes / 1024).toFixed(1)} KB
          </div>
          {verdict.signals.length > 0 && (
            <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {verdict.signals.slice(0, 6).map((s) => (
                <li key={s.id} style={{ fontSize: 10.5, color: "#C7D2DA", paddingLeft: 11, position: "relative", lineHeight: 1.35 }}>
                  <span style={{ position: "absolute", left: 0, color: "#6b7a85" }}>-</span>
                  {s.reason}
                </li>
              ))}
            </ul>
          )}
          <div style={{ fontSize: 9, color: "#6b7a85", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            źródło: inspekcja strukturalna · 0 sieci · nie antywirus
          </div>
        </div>
      )}
    </section>
  )
}

function Card({ card }: { card: FeatureCard }) {
  const color = LEVEL_COLOR[card.level]
  return (
    <div
      style={{
        border: "1px solid #1c2b36",
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "8px 10px",
        background: "rgba(255,255,255,0.02)"
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#E6EDF3" }}>{card.title}</span>
        {typeof card.score === "number" && (
          <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 14, fontWeight: 700, color }}>
            {card.score}
          </span>
        )}
      </div>
      {card.lines.map((line, i) => (
        <div key={i} style={{ fontSize: 11, color: "#C7D2DA", marginTop: 4, lineHeight: 1.4 }}>
          {line}
        </div>
      ))}
      {card.action && (
        <div style={{ fontSize: 10, color: "#2BD4C4", marginTop: 5 }}>▸ {card.action}</div>
      )}
      <div style={{ fontSize: 9, color: "#6b7a85", marginTop: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        źródło: {card.source}
      </div>
    </div>
  )
}
