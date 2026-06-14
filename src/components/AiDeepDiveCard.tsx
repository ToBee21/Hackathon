import { useEffect, useState } from "react"

import { AI_DEEP_DIVE_CATEGORY_LABELS } from "../shared/aiDeepDive/categories"
import {
  AI_DEEP_DIVE_MODELS,
  DEFAULT_AI_DEEP_DIVE_MODEL_ID,
  getModelOption
} from "../shared/aiDeepDive/models"
import type { AiDeepDiveRiskResult } from "../shared/aiDeepDive/types"
import { ShieldAlert } from "./icons"

const LEVEL_META = {
  low: { label: "LOW", color: "#6E7480" },
  medium: { label: "MED", color: "#E6B450" },
  high: { label: "HIGH", color: "#FF7A66" },
  critical: { label: "CRITICAL", color: "#FF5C77" }
} as const

function modelModeLabel(mode: string | undefined): string {
  if (mode === "heuristic+llm-json") return "lokalny LLM"
  if (mode === "heuristic+nli") return "lokalny NLI"
  return "heurystyka lokalna"
}

export default function AiDeepDiveCard({
  risk,
  maxCamoActive,
  aiModeEnabled,
  onToggleAiMode,
  selectedModelId = DEFAULT_AI_DEEP_DIVE_MODEL_ID,
  onSelectModel
}: {
  risk: AiDeepDiveRiskResult | null | undefined
  maxCamoActive?: boolean
  aiModeEnabled: boolean
  onToggleAiMode: (enabled: boolean) => void
  selectedModelId?: string
  onSelectModel?: (modelId: string) => void
}) {
  const selectedModel = getModelOption(selectedModelId)
  const isGemma = selectedModelId === "gemma-3-1b"
  // Gemma Terms of Use §3.1.4 requires showing the verbatim notice; we gate Gemma
  // behind a one-time in-UI acknowledgement (stored locally).
  const [gemmaConsent, setGemmaConsent] = useState<boolean | null>(null)
  useEffect(() => {
    try {
      const store = (globalThis as { chrome?: typeof chrome }).chrome?.storage
        ?.local
      if (!store) return setGemmaConsent(false)
      store.get("cnd:gemma-consent", (r: Record<string, unknown>) => {
        const v = r?.["cnd:gemma-consent"] as { accepted?: boolean } | undefined
        setGemmaConsent(Boolean(v?.accepted))
      })
    } catch {
      setGemmaConsent(false)
    }
  }, [])
  const acceptGemma = () => {
    try {
      ;(globalThis as { chrome?: typeof chrome }).chrome?.storage?.local?.set({
        "cnd:gemma-consent": { accepted: true, ts: Date.now() }
      })
    } catch {
      /* best-effort */
    }
    setGemmaConsent(true)
  }
  const active = risk && risk.level !== "low"
  const serious = risk?.level === "high" || risk?.level === "critical"
  const scanUnavailable = risk?.evidenceTags.includes("dom_scan_unavailable")
  const meta = risk ? LEVEL_META[risk.level] : LEVEL_META.low
  const categories =
    scanUnavailable
      ? "DOM niedostępny, zapisano fallback bez raw URL"
      : risk?.categories
          .slice(0, 3)
          .map((entry) => AI_DEEP_DIVE_CATEGORY_LABELS[entry.category])
          .join(", ") || (risk ? "brak wrażliwych kategorii" : "brak raportu")
  const statusText = !risk
    ? "Czekam na raport tej strony"
    : scanUnavailable
      ? "Raport strony: Chrome blokuje skan DOM tutaj"
    : serious
      ? "Ta treść jest wysoko profilowalna przez AI/trackerów"
      : risk.level === "medium"
        ? "Raport strony: umiarkowane sygnały profilowania AI"
        : "Raport strony: niskie ryzyko profilowania AI"

  return (
    <div
      className="overflow-hidden rounded-xl bg-surface-1 p-3 shadow-card ring-1 ring-inset"
      style={{
        borderColor: active ? `${meta.color}55` : "transparent",
        boxShadow: active ? `0 0 0 1px ${meta.color}2b, 0 18px 48px rgba(0,0,0,0.22)` : undefined,
        ["--risk" as string]: meta.color
      }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}>
            <ShieldAlert size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-micro uppercase text-fg-low">AI Deep-Dive Risk</p>
            <p className="mt-1 text-[12px] font-semibold leading-snug text-fg-hi">
              {statusText}
            </p>
          </div>
        </div>

        <span
          className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tnum"
          style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}>
          {meta.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-white/[0.03] px-2.5 py-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-fg-mid">{categories}</p>
          <p className="mt-0.5 text-[10px] text-fg-low">
            Tryb: {modelModeLabel(risk?.model?.mode)} · bez zapisu treści strony
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[18px] font-semibold leading-none tnum text-fg-hi">
            {risk?.score ?? 0}
          </p>
          <p className="mt-0.5 text-[10px] text-fg-low">score</p>
        </div>
      </div>

      {maxCamoActive && (
        <p className="mt-2 text-[10px] font-medium text-[#FF8EA0]">
          Max camo aktywny: mysz, klawiatura, fingerprint, DataGhost.
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-fg-mid">Lokalny model</p>
          <p className="truncate text-[9px] text-fg-low">
            {selectedModel.modelId} · ~{selectedModel.approxDownloadMb} MB ·{" "}
            {selectedModel.localModelId ? "pakiet extension" : selectedModel.license}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={aiModeEnabled}
          aria-label="Przełącz lokalny klasyfikator AI Deep-Dive"
          onClick={() => onToggleAiMode(!aiModeEnabled)}
          className="relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-base ease-standard"
          style={{
            backgroundColor: aiModeEnabled ? meta.color : "#2C2F39",
            boxShadow: aiModeEnabled
              ? `inset 0 0 0 1px ${meta.color}, 0 0 0 3px ${meta.color}1f`
              : "inset 0 0 0 1px rgba(255,255,255,0.10)"
          }}>
          <span
            className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-fg-hi shadow"
            style={{
              transform: aiModeEnabled ? "translateX(18px)" : "translateX(0)",
              transition: "transform 220ms cubic-bezier(0.34,1.56,0.64,1)"
            }}
          />
        </button>
      </div>

      <label className="mt-2 flex flex-col gap-1">
        <span className="text-[9px] uppercase tracking-[0.14em] text-fg-low">
          Silnik klasyfikacji
        </span>
        <select
          value={selectedModelId}
          disabled={!aiModeEnabled || !onSelectModel}
          aria-label="Wybierz lokalny model AI Deep-Dive"
          onChange={(event) => onSelectModel?.(event.target.value)}
          className="w-full rounded-lg bg-white/[0.04] px-2 py-1.5 text-[11px] text-fg-hi outline-none ring-1 ring-inset ring-line-strong transition-colors focus:ring-accent disabled:opacity-40"
          style={{ colorScheme: "dark" }}>
          {AI_DEEP_DIVE_MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label} · ~{model.approxDownloadMb} MB{model.localModelId ? " · pakiet" : ""}
            </option>
          ))}
        </select>
        {selectedModel.note && (
          <span className="text-[9px] text-fg-low">{selectedModel.note}</span>
        )}
      </label>

      {isGemma && gemmaConsent === false && (
        <div
          className="mt-2 rounded-lg p-2 text-[10px] leading-relaxed"
          style={{
            border: "1px solid rgba(64,224,200,0.35)",
            background: "rgba(64,224,200,0.06)",
            color: "#cfe7e2"
          }}>
          <p className="font-semibold" style={{ color: "#e7f6f3" }}>
            Gemma — wymagana akceptacja licencji
          </p>
          <p className="mt-1">
            Gemma is provided under and subject to the Gemma Terms of Use found at
            ai.google.dev/gemma/terms. Model objęty też Gemma Prohibited Use Policy
            (m.in. zakaz nieautoryzowanego śledzenia osób bez ich zgody).
          </p>
          <p className="mt-1">
            <a
              href="https://ai.google.dev/gemma/terms"
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: "#40e0c8" }}>
              Terms
            </a>
            {" · "}
            <a
              href="https://ai.google.dev/gemma/prohibited_use_policy"
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: "#40e0c8" }}>
              Prohibited Use Policy
            </a>
          </p>
          <button
            type="button"
            onClick={acceptGemma}
            className="mt-2 rounded px-2 py-1 font-semibold"
            style={{ background: "rgba(64,224,200,0.92)", color: "#04211c" }}>
            Akceptuję Gemma Terms of Use
          </button>
        </div>
      )}
    </div>
  )
}
