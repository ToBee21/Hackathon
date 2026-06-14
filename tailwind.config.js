/**
 * tailwind.config.js — Design tokens for "PrivacyMyst" (Moduł C).
 *
 * Design language: "Stealth Intelligence Console" — a cold counter-surveillance
 * instrument over a near-black void, with a single rationed teal "tracer" accent.
 * Depth is built by surface-lightening + hairline borders, not heavy shadows.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ["./src/**/*.{ts,tsx,html,js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Layered near-black neutrals (cool ~250 hue) — never pure #000.
        void: "#0A0B0E",
        surface: {
          0: "#101218",
          1: "#15171F",
          2: "#1B1E27",
          3: "#23262F"
        },
        input: "#2C2F39",
        // Hairlines as colors (white alpha) — used for borders / rings.
        line: {
          DEFAULT: "rgba(255,255,255,0.06)",
          strong: "rgba(255,255,255,0.10)",
          hover: "rgba(255,255,255,0.16)"
        },
        // Foreground text ramp — tops out below pure #fff.
        fg: {
          hi: "#ECEDEF",
          mid: "#A3A8B4",
          low: "#6E7480"
        },
        // The single rationed accent (desaturated teal "tracer").
        accent: {
          DEFAULT: "#2BD4C4",
          strong: "#1FB6A6",
          dim: "rgba(43,212,196,0.12)",
          glow: "rgba(43,212,196,0.45)"
        },
        // Semantics — only ever paired with an icon + label, never colour-alone.
        success: "#1FB6A6",
        warn: "#F5A623",
        danger: {
          DEFAULT: "#E5484D",
          strong: "#D03439"
        },
        info: "#5E8BFF",
        // Module signal palette — used sparingly as per-source data accents.
        ghost: "#9A8CFF",
        keys: "#46E6A8"
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "Roboto",
          "sans-serif"
        ],
        // The data layer (telemetry / counters / hashes) — system mono, sharp & offline.
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Cascadia Code",
          "JetBrains Mono",
          "Consolas",
          "Menlo",
          "monospace"
        ]
      },
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.08em" }],
        ui: ["0.8125rem", { lineHeight: "1.4", letterSpacing: "-0.005em" }],
        display: ["2.5rem", { lineHeight: "1.0", letterSpacing: "-0.03em" }]
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px"
      },
      boxShadow: {
        // Depth as: lit top edge + tight contact + broad ambient.
        hairline: "inset 0 0 0 1px rgba(255,255,255,0.08)",
        card:
          "inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.45), 0 8px 24px -8px rgba(0,0,0,0.5)",
        raised:
          "inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 4px rgba(0,0,0,0.5), 0 16px 40px -12px rgba(0,0,0,0.6)",
        "glow-accent": "0 0 0 3px rgba(43,212,196,0.15)",
        "glow-danger": "0 0 0 3px rgba(229,72,77,0.18)"
      },
      transitionTimingFunction: {
        enter: "cubic-bezier(0.05,0.7,0.1,1)",
        exit: "cubic-bezier(0.3,0,0.8,0.15)",
        standard: "cubic-bezier(0.2,0,0,1)",
        snap: "cubic-bezier(0.12,0,0.08,1)",
        overshoot: "cubic-bezier(0.34,1.56,0.64,1)"
      },
      transitionDuration: {
        micro: "140ms",
        base: "220ms",
        enter: "320ms"
      }
    }
  },
  plugins: []
}
