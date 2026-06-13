// src/components/StatCards.tsx
// Bento metric cards — micro-label + tinted icon chip + big tabular number + unit.
// Numbers sit in fixed tabular slots so 1- vs 3-digit counts never shift layout.
// Hover lifts the card (surface → raised) on the standard easing.

import type { ReactNode } from "react"

import { Aperture, Ghost } from "./icons"
import type { PrivacyState } from "../types"

function Card({
  icon,
  color,
  label,
  value,
  unit
}: {
  icon: ReactNode
  color: string
  label: string
  value: number
  unit: string
}) {
  return (
    <div className="group rounded-xl bg-surface-2 p-3 shadow-card transition-transform duration-base ease-standard hover:-translate-y-0.5 hover:shadow-raised">
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
        label="Szum wstrzyknięty"
        value={state.noiseGeneratedCount}
        unit="fałszywe sygnały"
      />
      <Card
        icon={<Aperture size={15} />}
        color="#5E8BFF"
        label="Trackery zmylone"
        value={state.trackersBlockedCount}
        unit="profile rozbite"
      />
    </div>
  )
}
