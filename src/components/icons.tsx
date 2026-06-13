// src/components/icons.tsx
// Hand-built inline SVG icon set — no emoji, no icon-font, no network dependency.
// Every glyph inherits `currentColor`, so tone is driven entirely by text color.
// Stroke geometry on a 24px grid, round caps/joins, optically balanced for ~16–22px.

import type { SVGProps } from "react"

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function Svg({ size = 18, strokeWidth = 1.6, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}>
      {children}
    </svg>
  )
}

/** Brand monogram — a shield (cloak) over a watched iris, struck by a dagger. */
export function Logo({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...rest}>
      <path
        d="M12 2.6l7 2.7v5.2c0 4.6-3 8.2-7 9.5-4-1.3-7-4.9-7-9.5V5.3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <circle cx="12" cy="10.6" r="2.5" stroke="var(--accent)" strokeWidth="1.5" />
      <path
        d="M8.4 14.6l7.2-7.2"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Protected — shield with check. */
export function ShieldCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l7 2.7v5.1c0 4.5-3 8-7 9.2-4-1.2-7-4.7-7-9.2V5.7z" />
      <path d="M9 11.8l2.1 2.1L15 9.9" />
    </Svg>
  )
}

/** Attention — shield with an exclamation. */
export function ShieldAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l7 2.7v5.1c0 4.5-3 8-7 9.2-4-1.2-7-4.7-7-9.2V5.7z" />
      <path d="M12 8.4v3.4" />
      <path d="M12 14.7v.02" />
    </Svg>
  )
}

/** Standby — shield struck through. */
export function ShieldOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l7 2.7v5.1c0 4.5-3 8-7 9.2-4-1.2-7-4.7-7-9.2V5.7z" />
      <path d="M5.2 5.2l13.6 13.6" />
    </Svg>
  )
}

/** DataGhost — a calm ghost glyph. */
export function Ghost(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 20.5V11a7 7 0 0 1 14 0v9.5l-2.4-1.6-2.3 1.6L12 19.4l-2.3 1.6-2.3-1.6z" />
      <path d="M9.4 10.6v.02" />
      <path d="M14.6 10.6v.02" />
    </Svg>
  )
}

/** Bionic Blur — mouse — a pointer/cursor with jitter trail. */
export function Cursor(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 4.2l8.7 4.1-3.6 1.1-1.1 3.6z" />
      <path d="M13.4 13.4l4.1 4.1" />
    </Svg>
  )
}

/** Bionic Blur — keyboard — a key deck. */
export function Keyboard(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6.5" width="18" height="11" rx="2.2" />
      <path d="M7 10v.02M11 10v.02M15 10v.02M17 10v.02M7 13.4h10" />
    </Svg>
  )
}

/** Panic kill-switch — power symbol. */
export function Power(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v8.5" />
      <path d="M7.4 6.6a7 7 0 1 0 9.2 0" />
    </Svg>
  )
}

/** Live telemetry — heartbeat pulse line. */
export function Activity(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12h3.5l2-6 3.5 12 2.2-6H21" />
    </Svg>
  )
}

/** System / core — concentric aperture. */
export function Aperture(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4l3.6 6.2M20 12l-7.2 0M15.6 17.8l-3.6-6.2M4 12h7.2M8.4 6.2l3.6 6.2" />
    </Svg>
  )
}

/** Identity masking — disposable e-mail alias (envelope). */
export function Mail(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
      <path d="M4 7l8 5.5L20 7" />
    </Svg>
  )
}

/** Digital-shadow audit — a fingerprint whorl. */
export function Fingerprint(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6a8.4 8.4 0 0 0-8 6" />
      <path d="M5.4 18.6A10 10 0 0 0 6.5 11a5.5 5.5 0 0 1 11 0v1.5" />
      <path d="M9 11a3 3 0 0 1 6 0c0 3 .2 5.4-.9 7.8" />
      <path d="M12 11v2.5c0 2.6-.5 4.4-1.6 6.1" />
      <path d="M17.4 15.2a16 16 0 0 1-.7 4.6" />
    </Svg>
  )
}

/** Honeypot Trap — a crosshair/target, the active data-poisoning trap. */
export function Crosshair(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
      <circle cx="12" cy="12" r="1.6" />
    </Svg>
  )
}

/** Targeting Shield — a funnel/filter that strips and blocks targeting. */
export function Filter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 5h18l-7 8v6l-4-2v-4z" />
    </Svg>
  )
}

/** Fullscreen — expand to four corners. */
export function Maximize(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    </Svg>
  )
}

/** Cookie Shredder — a cookie with crumbs (tracking cookie being mangled). */
export function Cookie(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3a9 9 0 1 0 9 9 3.6 3.6 0 0 1-4-4 3.6 3.6 0 0 1-5-5z" />
      <path d="M9 10v.02M14 9v.02M15 14v.02M10 15v.02" />
    </Svg>
  )
}

/** Local-only / encrypted footer mark. */
export function Lock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.4v2.2" />
    </Svg>
  )
}
