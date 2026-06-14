// src/sidepanel.tsx
// The serious long-running companion surface (chrome.sidePanel). Renders the
// SAME current-page analysis the floating window computed, plus richer settings
// and model status. It reads cnd:last-analysis (pushed by the content script via
// the service worker) for the active tab.
//
// Why heavier workflows live here and not in the page overlay: this is a
// chrome-extension:// surface the host page cannot read — the right place for
// confidential rendering, unlike the in-page Shadow DOM bubble.

import { useEffect, useState, type CSSProperties } from "react"

import wordmark from "url:../assets/wordmark.png"

import { getModelOption } from "./shared/aiDeepDive/models"
import type { CardLevel, FeatureCard } from "./shared/featureRegistry"
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
        <img
          src={wordmark}
          alt="PrivacyMyst"
          style={{ height: 20, width: "auto", display: "block", marginBottom: 4 }}
        />
        <div style={{ fontSize: 15, fontWeight: 600, color: "#E6EDF3" }}>Page Audit</div>
        <div style={{ fontSize: 11, color: "#6b7a85", marginTop: 2 }}>
          {analysis ? describePage(analysis.page) : loading ? "ładowanie…" : "brak analizy aktywnej karty"}
        </div>
      </header>

      <section
        style={{
          border: "1px solid #1c2b36",
          borderRadius: 10,
          padding: "8px 10px",
          marginBottom: 12,
          fontSize: 11
        }}>
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
          <span style={{ color: "#6b7a85" }}>~{model.approxDownloadMb} MB · {model.license}</span>
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
    </div>
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
