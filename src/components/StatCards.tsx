// src/components/StatCards.tsx
// Bento metric cards — micro-label + tinted icon chip + big tabular number + unit.
// Numbers sit in fixed tabular slots so 1- vs 3-digit counts never shift layout.
// Hover lifts the card (surface → raised) on the standard easing.

import type { ReactNode } from "react"

import { Aperture, Cookie, Filter, Ghost } from "./icons"
import type { PrivacyState } from "../types"

function Card({
  icon,
  color,
  label,
  value,
  unit,
  span2
}: {
  icon: ReactNode
  color: string
  label: string
  value: number
  unit: string
  span2?: boolean
}) {
  return (
    <div
      className={`group rounded-xl bg-surface-2 p-3 shadow-card transition-transform duration-base ease-standard hover:-translate-y-0.5 hover:shadow-raised${
        span2 ? " col-span-2" : ""
      }`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-micro uppercase text-fg-low">{label}</span>
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{ backgroundColor: `${color}1a`, color }}>
          {icon}
        </span>
      </div>
      <p className="text-[26px] font-semibold leading-none tracking-tight tnum text-fg-hi">
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-fg-low">{unit}</p>
    </div>
  )
}

export default function StatCards({ state }: { state: PrivacyState }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card
        icon={<Ghost size={15} />}
        color="#9A8CFF"
        label="Ruch-wabik"
        value={state.noiseGeneratedCount}
        unit="anonimowe zapytania"
      />
      <Card
        icon={<Aperture size={15} />}
        color="#5E8BFF"
        label="Sygnały zamaskowane"
        value={state.trackersBlockedCount}
        unit="powierzchnie fingerprint"
      />
      <Card
        icon={<Cookie size={15} />}
        color="#F2C14E"
        label="Ciasteczka zrotowane"
        value={state.cookiesRotatedCount ?? 0}
        unit="zatrute ID trackerów"
        span2
      />
      <Card
        icon={<Filter size={15} />}
        color="#3DD4A0"
        label="Atrybucja zerwana"
        value={state.paramsStrippedCount ?? 0}
        unit="usunięte click-ID / utm"
      />
      <Card
        icon={<Filter size={15} />}
        color="#3DD4A0"
        label="Targeting odcięty"
        value={state.targetingBlockedCount ?? 0}
        unit="beacony na wrażliwych stronach"
      />
    </div>
  )
}
