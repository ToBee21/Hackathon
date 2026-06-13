import { AI_DEEP_DIVE_CATEGORY_LABELS } from "../shared/aiDeepDive/categories"
import type { AiDeepDiveRiskResult } from "../shared/aiDeepDive/types"
import { ShieldAlert } from "./icons"

const LEVEL_META = {
  low: { label: "LOW", color: "#6E7480" },
  medium: { label: "MED", color: "#E6B450" },
  high: { label: "HIGH", color: "#FF7A66" },
  critical: { label: "CRITICAL", color: "#FF5C77" }
} as const

export default function AiDeepDiveCard({
  risk,
  maxCamoActive
}: {
  risk: AiDeepDiveRiskResult | null | undefined
  maxCamoActive?: boolean
}) {
  const active = risk && risk.level !== "low"
  const meta = risk ? LEVEL_META[risk.level] : LEVEL_META.low
  const categories =
    risk?.categories
      .slice(0, 3)
      .map((entry) => AI_DEEP_DIVE_CATEGORY_LABELS[entry.category])
      .join(", ") || "brak aktywnego ryzyka"

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
              {active
                ? "Ta treść jest wysoko profilowalna przez AI/trackerów"
                : "Brak wysokiego ryzyka profilowania AI"}
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
            rawTextRetained: false · {risk?.model?.mode ?? "heuristic"}
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
    </div>
  )
}

