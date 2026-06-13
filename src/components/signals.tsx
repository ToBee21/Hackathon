// src/components/signals.tsx
// Single source of truth for per-source identity (color + label + icon),
// shared by the toggles, the live telemetry feed and the stat cards so the
// "GHOST / MOUSE / KEYS / CORE" legend reads consistently across the UI.
// These module hues are a deliberate data-legend — distinct from the rationed
// teal "tracer" accent, which is reserved for the hero ring + armed status.

import type { ComponentType, SVGProps } from "react"

import { Aperture, Crosshair, Cursor, Ghost, Keyboard, ShieldAlert } from "./icons"
import type { LogSource } from "./types"

type IconType = ComponentType<{ size?: number } & SVGProps<SVGSVGElement>>

export interface SignalMeta {
  label: string
  short: string
  color: string
  Icon: IconType
}

export const SIGNAL: Record<LogSource, SignalMeta> = {
  dataGhost: { label: "DataGhost", short: "GHOST", color: "#9A8CFF", Icon: Ghost },
  mouseJitter: { label: "Mysz", short: "MOUSE", color: "#5E8BFF", Icon: Cursor },
  keystroke: { label: "Klawiatura", short: "KEYS", color: "#46E6A8", Icon: Keyboard },
  aiDeepDive: { label: "AI Deep-Dive", short: "AI-RISK", color: "#FF5C77", Icon: ShieldAlert },
  honeypot: { label: "Honeypot", short: "TRAP", color: "#FF8A3D", Icon: Crosshair },
  system: { label: "Rdzeń", short: "CORE", color: "#A3A8B4", Icon: Aperture }
}
