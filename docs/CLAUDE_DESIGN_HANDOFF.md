# Cloak & Dagger Premium Redesign Handoff

> Source-of-truth handoff for a full premium UI redesign of the Cloak & Dagger
> Chrome extension. This document analyzes the **current** UI as it exists in
> code, criticizes it honestly, and specifies the target black/red/white
> redesign with exact file paths, component names, tokens, and CSS values.
>
> **This is a handoff, not an implementation.** Do not change UI code from this
> document. The ready-to-run implementation prompt is in Section 19.
>
> Grounding pass performed against:
> [src/popup.tsx](../src/popup.tsx),
> [src/components/AiDeepDiveCard.tsx](../src/components/AiDeepDiveCard.tsx),
> [src/components/ScoreChart.tsx](../src/components/ScoreChart.tsx),
> [src/components/StatCards.tsx](../src/components/StatCards.tsx),
> [src/components/ShadowAudit.tsx](../src/components/ShadowAudit.tsx),
> [src/components/icons.tsx](../src/components/icons.tsx),
> [src/style.css](../src/style.css),
> [tailwind.config.js](../tailwind.config.js),
> [src/content/floatingWindow.ts](../src/content/floatingWindow.ts),
> [src/sidepanel.tsx](../src/sidepanel.tsx).

---

## 1. Product Identity

After redesign, Cloak & Dagger should read as:

- a **defensive privacy instrument** — a tool, not a marketing widget
- a **local-first browser intelligence layer** — all inference runs on-device;
  the side panel and footer already say "dane nie opuszczają urządzenia"
- a **serious control panel** for behavioral camouflage, fingerprint masking,
  and AI profiling-risk assessment
- a **compact command surface** that condenses real telemetry, not decoration

It is **not**:

- a cute privacy popup
- an adblock clone
- a toy shield app
- a generic AI-assistant panel
- a neon cyberpunk dashboard
- a cheap extension template

**Emotional target:** trust, control, alertness, precision, craftsmanship,
quiet aggression — professional paranoia that reads as competence, not theatre.

---

## 2. Current UI Inventory

All paths are exact. Surfaces: **popup** (Plasmo, React + Tailwind),
**floating window** (content-script Shadow DOM, hand-written inline CSS),
**side panel** (React, inline-style objects), **fullscreen dashboard tab**.

| Area | Component / File | Current Role | Visible In Screenshot | Notes |
|---|---|---|---|---|
| Popup root | [src/popup.tsx](../src/popup.tsx) | App shell, tab state, message bus, score compute, storage | Yes | 360px fixed width; `.console` ambient bg + `.stagger` entrance |
| Global tokens | [tailwind.config.js](../tailwind.config.js) | Color/type/shadow/easing tokens | Indirectly | Teal-first (`accent #2BD4C4`); near-black neutrals |
| Global CSS | [src/style.css](../src/style.css) | Ambient orb, blueprint grid, grain, keyframes, reduced-motion net | Indirectly | `--orb`, `--accent`, `heroPulse`, `drift`, `ringPing` |
| Header brand | [src/popup.tsx:462-475](../src/popup.tsx#L462-L475) | Logo chip + "Cloak & Dagger" + "Active Privacy Defense" | Yes | `edge-lit` lit-glass chip |
| Fullscreen button | [src/popup.tsx:479-494](../src/popup.tsx#L479-L494) | Opens `tabs/dashboard.html` | Yes (expand icon) | Inline `<svg>`, not from icon set |
| Status pill (ARMED) | [src/popup.tsx:496-515](../src/popup.tsx#L496-L515) | ARMED / STANDBY with ping dot | Yes (ARMED) | Teal when armed; `anim-ping` |
| Tab switcher | [src/popup.tsx:519-539](../src/popup.tsx#L519-L539) | STATUS / RADAR | Yes | Inline teal underline + bg |
| Score gauge | [src/components/ScoreChart.tsx](../src/components/ScoreChart.tsx) | Radial Privacy Score, rAF roll-up, tier pill, jitter field | Yes (100, PROTECTED) | Teal gradient stroke `#2BD4C4→#1FB6A6`; `heroPulse` glow |
| Score proof line | [src/components/ScoreChart.tsx:172-177](../src/components/ScoreChart.tsx#L172-L177) | "N wabik · N masek" | Yes (459 wabik · 18290 masek) | Mono, tabular |
| Stat cards | [src/components/StatCards.tsx](../src/components/StatCards.tsx) | RUCH-WABIK / SYGNAŁY ZAMASKOWANE | Yes | Colors `#9A8CFF`, `#5E8BFF` hardcoded |
| AI risk card | [src/components/AiDeepDiveCard.tsx](../src/components/AiDeepDiveCard.tsx) | CRITICAL badge, status text, topics, score, model toggle/select | Yes | Level colors hardcoded in `LEVEL_META` |
| Side-panel launch button | [src/popup.tsx:570-576](../src/popup.tsx#L570-L576) | "Otwórz Side Panel" | FOUND_IN_CODE_NOT_VISIBLE_IN_REFERENCE | Below risk card |
| Module toggles | src/components/ModuleToggles.tsx | DataGhost / jitter / keystroke / honeypot switches | FOUND_IN_CODE_NOT_VISIBLE_IN_REFERENCE | Referenced [src/popup.tsx:581](../src/popup.tsx#L581) |
| Honeypot test button | [src/popup.tsx:583-592](../src/popup.tsx#L583-L592) | Fire decoy to tracker | FOUND_IN_CODE_NOT_VISIBLE_IN_REFERENCE | Danger color `#FF5C7A` hardcoded |
| Logger | src/components/LoggerView.tsx | Live telemetry feed | FOUND_IN_CODE_NOT_VISIBLE_IN_REFERENCE | `scroll-thin`, log-collapse window |
| Virtual identity | [src/components/VirtualIdentity.tsx](../src/components/VirtualIdentity.tsx) | Persona selector + mask intensity | FOUND_IN_CODE_NOT_VISIBLE_IN_REFERENCE | |
| Shadow audit | [src/components/ShadowAudit.tsx](../src/components/ShadowAudit.tsx) | Real vs masked entropy bars | FOUND_IN_CODE_NOT_VISIBLE_IN_REFERENCE | Red `#E5484D` real / green `#46E6A8` mask |
| Panic button | src/components/PanicButton.tsx | Hold-to-wipe | FOUND_IN_CODE_NOT_VISIBLE_IN_REFERENCE | Referenced [src/popup.tsx:619](../src/popup.tsx#L619) |
| Alias footer | [src/popup.tsx:623-648](../src/popup.tsx#L623-L648) | Email alias + "Privacy-by-Design" | FOUND_IN_CODE_NOT_VISIBLE_IN_REFERENCE | |
| Radar tab | [src/popup.tsx:653-680](../src/popup.tsx#L653-L680) / src/components/CyberRadar.tsx | Honeypot radar sweep | Yes (RADAR tab exists) | `#E5484D`, `#9A8CFF` legend dots |
| Floating window | [src/content/floatingWindow.ts](../src/content/floatingWindow.ts) | On-page Shadow DOM bubble + panel | N/A (on-page) | **Entirely separate inline CSS**, not Tailwind |
| Side panel | [src/sidepanel.tsx](../src/sidepanel.tsx) | Long-running page audit | N/A | **Inline-style objects**, different palette (`#0E1116`, `#1c2b36`) |
| Icon set | [src/components/icons.tsx](../src/components/icons.tsx) | Hand-built inline SVG glyphs | Yes (shield, etc.) | Already custom; `currentColor`; accent leaks in `Logo` |
| Fullscreen dashboard | tabs/dashboard.html (+ entry) | Fullscreen view | UNKNOWN_FROM_CODE | Entry not read; URL referenced [src/popup.tsx:437](../src/popup.tsx#L437) |
| Stray CSS artifact | .plasmo/gowno.css | Build artifact open in IDE | No | IDE-opened; not a source file — ignore |

**VISIBLE_IN_UI_BUT_SOURCE_NOT_FOUND:** none — every screenshot element maps to
a file above. The "PROTECTED badge" is the `ScoreChart` tier pill
([ScoreChart.tsx:165-170](../src/components/ScoreChart.tsx#L165-L170)).

---

## 3. Existing Visual Hierarchy

**Attention order today:** (1) the glowing teal score ring, (2) the ARMED pill,
(3) the CRITICAL risk card, (4) the stat numbers, (5) everything else.

The hierarchy is mostly correct but the *identity* is wrong: the strongest,
most-repeated signal is **teal glow**, which reads as generic "cyber-SaaS,"
not as a serious black/red/white security instrument. Danger and "armed" — the
two states that should own the loudest color — currently share the stage with a
decorative teal that means "good."

| Element | Current Priority | Problem | Keep / Replace / Rework |
|---|---|---|---|
| Score ring | 1 (hero) | Teal gradient + `heroPulse` infinite glow = the cheapest-looking element; pulses forever even when nothing is happening | Rework: keep the instrument, drop the perpetual glow, recolor to white/red semantics |
| ARMED pill | 2 | "Armed" is teal — armed should read as red/charged, not friendly mint | Rework: armed = signal red, protected = restrained white/green |
| CRITICAL risk card | 3 | Strong, but its red (`#FF5C77`) is a different red from the danger token (`#E5484D`) and from honeypot `#FF5C7A` — three reds | Keep priority, unify red |
| Stat cards | 4 | Per-card colors (`#9A8CFF`, `#5E8BFF`) are arbitrary "rainbow" accents with no system meaning | Rework: neutralize to white/gray data, red only on alert |
| Ambient orb + grid + grain | background | `heroPulse`, aurora orb, blueprint grid, film grain — three decorative layers competing; "cool" without function | Reduce: keep at most one restrained texture |
| Jitter particles | background | Drifting teal dots "prove" defense is working — theatrical, not data | Replace: remove or convert to a real activity readout |
| Tab underline | 2-3 | Teal underline + teal bg + teal text = teal everywhere | Rework: white active, red only for alert tabs |
| Footer alias/trust line | low | Fine, but mixes uppercase tracking with body copy inconsistently | Keep, tighten rhythm |

---

## 4. Redesign Goal

> **Turn Cloak & Dagger from a glowing teal cyber dashboard into a premium
> black/red/white privacy command instrument that feels handcrafted, sharp,
> dangerous, and trustworthy — where red means risk/armed and nothing glows
> unless something is actually wrong.**

Practical goals:

- stronger, ownable brand identity (black/red/white, not teal-SaaS)
- remove generic cyber glow; one restrained texture at most
- disciplined, tokenized spacing (no per-component magic px)
- premium typography with a real numeric hierarchy for scores/counters
- sharper risk communication (one red, three risk weights)
- stronger active/inactive (armed/standby, protected/exposed) contrast
- serious, cohesive iconography (the set is already custom — finish it)
- reusable design tokens shared across popup, floating window, side panel
- accessible keyboard + screen-reader behavior; no color-only meaning
- scalable component architecture under `src/ui/`

---

## 5. Visual Language

Core style:

- **matte black base** (`--color-bg-root`), never pure `#000`
- **deep charcoal surfaces** built by lightening, not heavy shadow
- **white / near-white primary text** (current `#ECEDEF` is a good ceiling)
- **blood / signal red** for risk **and** armed state — the one loud color
- **muted gray** for secondary metadata and inactive states
- **restrained hairline borders** (white-alpha), surgical highlights
- **controlled shadow depth** (the existing `card`/`raised` recipe is good)
- no excessive blur, no cheap neon, **no cyan as primary identity** — teal may
  survive only as a tiny legacy/data accent, never as the brand color

Intended feel: forged metal, technical glass, classified dossier, cockpit
restraint, surgical warning system, premium security appliance — **without**
military cosplay (no stencil fonts, no camo, no "tactical" clip-art).

---

## 6. Color System Proposal

**Current colors extracted from code** (the redesign replaces the teal-first
core):

- Neutrals: `--void #0A0B0E`, `surface-0 #101218`, `surface-1 #15171F`,
  `surface-2 #1B1E27`, `surface-3 #23262F`, `input #2C2F39`
  ([tailwind.config.js:16-23](../tailwind.config.js#L16-L23))
- Hairlines: `rgba(255,255,255,0.06 / 0.10 / 0.16)`
- Text: `fg-hi #ECEDEF`, `fg-mid #A3A8B4`, `fg-low #6E7480`
- Accent (teal): `#2BD4C4`, `strong #1FB6A6`, `glow rgba(43,212,196,0.45)`
- Danger: `#E5484D` / `#D03439`; warn `#F5A623`; info `#5E8BFF`
- Module accents: `ghost #9A8CFF`, `keys #46E6A8`
- Risk reds (inconsistent): `#FF5C77` (AiDeepDiveCard/floating critical),
  `#FF7A66` (high), `#FF5C7A` (honeypot button), `#E5484D` (danger token)
- Floating window own palette: bg `#0E1116`, border `#1c2b36`, text `#C7D2DA`,
  muted `#6b7a85` ([floatingWindow.ts:141-210](../src/content/floatingWindow.ts#L141-L210))

**Proposed black/red/white token system:**

| Token | Proposed Value | Usage | Why |
|---|---|---|---|
| `--color-bg-root` | `#0A0A0B` | App/page root | Neutral matte black, drops the cool-blue cast |
| `--color-bg-panel` | `#111113` | Popup/panel surface | One step up from root |
| `--color-bg-elevated` | `#17171A` | Header, footers | Lit by hairline, not shadow |
| `--color-bg-card` | `#1B1B1F` | Metric/risk cards | Reads as a discrete object |
| `--color-bg-card-hover` | `#212127` | Card hover | Subtle lift |
| `--color-border-subtle` | `rgba(255,255,255,0.06)` | Default hairlines | Keep current value |
| `--color-border-strong` | `rgba(255,255,255,0.12)` | Emphasis borders, focus base | Keep family |
| `--color-text-primary` | `#F2F2F3` | Primary text, big numbers | Near-white, never pure |
| `--color-text-secondary` | `#A6A6AD` | Labels, descriptions | Replaces `fg-mid` |
| `--color-text-muted` | `#6E6E76` | Metadata, debug, units | Replaces `fg-low` |
| `--color-accent-primary` | `#E5484D` | **Primary brand accent = signal red** | Red is the identity, not teal |
| `--color-accent-primary-hover` | `#F25C61` | Hover/active red | Lift |
| `--color-accent-danger` | `#E5484D` | Critical risk, armed | One red — unifies the 3 reds today |
| `--color-accent-danger-bg` | `rgba(229,72,77,0.12)` | Risk card fill, badge bg | Matches existing dim pattern |
| `--color-accent-danger-border` | `rgba(229,72,77,0.40)` | Risk card border, ring | Replaces ad-hoc `${color}55` |
| `--color-status-armed` | `#E5484D` | ARMED pill | Armed = charged/red, not mint |
| `--color-status-protected` | `#E8E8EA` | PROTECTED state | Calm near-white, not loud |
| `--color-status-critical` | `#E5484D` | CRITICAL badge/ring | Same one red |
| `--color-warn` | `#E0A33A` | Medium risk only | Desaturated amber, paired w/ icon |
| `--color-focus-ring` | `rgba(229,72,77,0.55)` | Keyboard focus | Visible on black, on-brand |
| `--color-shadow-panel` | `0 16px 40px -12px rgba(0,0,0,0.6)` | Panel ambient | Keep existing `raised` depth |
| `--color-accent-legacy` | `#2BD4C4` | **Optional** tiny data/legacy accent | Teal demoted to data-only, never brand |

CSS, drop into `src/ui/styles/tokens.css`:

```css
:root {
  --color-bg-root: #0A0A0B;
  --color-bg-panel: #111113;
  --color-bg-elevated: #17171A;
  --color-bg-card: #1B1B1F;
  --color-bg-card-hover: #212127;

  --color-border-subtle: rgba(255, 255, 255, 0.06);
  --color-border-strong: rgba(255, 255, 255, 0.12);

  --color-text-primary: #F2F2F3;
  --color-text-secondary: #A6A6AD;
  --color-text-muted: #6E6E76;

  --color-accent-primary: #E5484D;
  --color-accent-primary-hover: #F25C61;
  --color-accent-danger: #E5484D;
  --color-accent-danger-bg: rgba(229, 72, 77, 0.12);
  --color-accent-danger-border: rgba(229, 72, 77, 0.40);

  --color-status-armed: #E5484D;
  --color-status-protected: #E8E8EA;
  --color-status-critical: #E5484D;
  --color-warn: #E0A33A;

  --color-focus-ring: rgba(229, 72, 77, 0.55);
  --color-shadow-panel: 0 16px 40px -12px rgba(0, 0, 0, 0.6);

  --color-accent-legacy: #2BD4C4; /* data-only, never brand identity */
}
```

No rainbow gradients. No teal-first palette. No high-saturation glow.

---

## 7. Typography System Proposal

**Current usage:** Inter / system sans for chrome
([tailwind.config.js:56-64](../tailwind.config.js#L56-L75)); system mono for the
data layer; `font-feature-settings: "ss02" 1, "cv11" 1, "cv05" 1` and
`tabular-nums slashed-zero` on `.tnum` ([style.css:36-44](../src/style.css#L36-L44)).
Sizes are mostly raw px in JSX (`text-[9px]`…`text-[26px]`), only three named
tokens exist (`micro`, `ui`, `display`).

Keep the Inter + system-mono stack. The redesign's job is to **replace raw px
with a named scale** and make numbers a deliberate hierarchy.

| Role | Font Size | Weight | Line Height | Letter Spacing | Case | Usage |
|---|---|---|---|---|---|---|
| app title | 13px | 600 | 1.15 | -0.01em | As-is | "Cloak & Dagger" |
| app subtitle | 9px | 500 | 1.3 | 0.16em | UPPER | "ACTIVE PRIVACY DEFENSE" |
| tab label | 11px | 600 | 1.0 | 0.12em | UPPER | STATUS / RADAR |
| score number | 40px | 600 | 1.0 | -0.03em | — | Privacy Score (`display` token) |
| score label | 11px | 500 | 1.3 | 0.08em | UPPER | "PRIVACY SCORE" |
| stat number | 26px | 600 | 1.0 | -0.01em | — | 459 / 18290 (mono, tnum) |
| stat title | 11px | 500 | 1.3 | 0.08em | UPPER | RUCH-WABIK |
| stat description | 11px | 400 | 1.4 | 0 | as-is | "anonimowe zapytania" |
| risk title | 12px | 600 | 1.3 | 0 | as-is | risk status sentence |
| risk body | 11px | 400 | 1.4 | 0 | as-is | topics / categories |
| metadata | 9-10px | 400 | 1.4 | 0.04em | as-is | rawTextRetained / mode |
| badge text | 10px | 600 | 1.0 | 0.06em | UPPER | CRITICAL / PROTECTED |
| button text | 11px | 600 | 1.0 | 0.02em | as-is | actions |

Rules: uppercase + tracking only on labels/badges; numbers always mono +
`tnum`; no letter-spacing on body copy; no fake-terminal styling outside the
mono data layer.

---

## 8. Layout Redesign Specification

Preserve current product meaning; improve architecture.

- **Panel dimensions:** popup stays **360px** fixed
  ([popup.tsx:456](../src/popup.tsx#L456)). Safe range 320–420px. Floating panel
  stays **320px**, `max-height: 70vh`
  ([floatingWindow.ts:154-159](../src/content/floatingWindow.ts#L154-L159)). Side
  panel fluid to host width.
- **Header:** brand mark + identity left, status pill + window controls right.
- **Scroll:** popup scrolls as one column; cards never scroll internally.
- **Floating window:** collapsed = 48px bubble showing risk score; expanded =
  draggable panel; keep open Shadow DOM and per-origin persistence.
- **Responsive:** at <340px, micro-metrics wrap below the score; stat grid stays
  2-up until <300px then 1-up.

```txt
Premium Extension Panel
├── Header Command Bar
│   ├── Brand Mark            (BrandMark, IconFrame)
│   ├── Product Identity      (title + subtitle)
│   ├── Primary Status Pill   (StatusPill — armed/standby)
│   └── Window Controls       (WindowControlButton — fullscreen)
├── Mode Switcher             (ModeTabs — Status / Radar)
├── Protection Summary
│   ├── Score Instrument      (ScoreInstrument)
│   ├── Protection State      (ProtectionBadge — PROTECTED/EXPOSED)
│   └── Micro Metrics         (MicroMetricRow — wabik · masek)
├── Defense Metrics
│   ├── Decoy Traffic         (MetricCard — RUCH-WABIK)
│   └── Masked Signals        (MetricCard — SYGNAŁY ZAMASKOWANE)
├── Threat Intelligence
│   ├── AI Profiling Risk     (ThreatRiskCard)
│   ├── Risk Score            (RiskScoreMeter)
│   ├── Detected Topics       (TopicSignalRow)
│   └── Active Countermeasures(CountermeasureLine)
└── System Footer / Debug Metadata (DebugMetadata)
```

Per section:

- **Header** — priority high; 12–14px padding; states armed/standby; depends on
  `anyEnabled`. Notes: status pill is the only red element in calm state.
- **Mode Switcher** — priority med; active tab = white text + 2px white/red
  underline; depends on `activeTab`.
- **Protection Summary** — priority highest; score ring centered; protected vs
  exposed swaps badge tone; depends on `score`/`tier`/`anyEnabled`.
- **Defense Metrics** — priority med; neutral data, no per-card color; depends on
  `noiseGeneratedCount`/`trackersBlockedCount`.
- **Threat Intelligence** — priority high when `level !== low`; red border/ring
  only then; depends on `state.aiDeepDiveRisk`.
- **System Footer** — priority low; muted; debug text demoted from the premium
  cards into here.

---

## 9. Component Redesign Contract

Logic stays; visuals are replaced. Keep all message-bus, storage, and score
logic in [src/popup.tsx](../src/popup.tsx) intact.

| Current Component | Current File | New Component Name | Redesign Role | Keep Logic? | Replace Visuals? |
|---|---|---|---|---|---|
| `Popup` | [src/popup.tsx](../src/popup.tsx) | `AppShell` | Shell + state owner (logic stays here) | Yes | Yes (className/markup) |
| header block | [popup.tsx:462-517](../src/popup.tsx#L462-L517) | `CommandHeader` | Header bar | Yes | Yes |
| `Logo` | [icons.tsx:31-56](../src/components/icons.tsx#L31-L56) | `BrandMark` | Brand glyph | Yes | Recolor (drop teal `var(--accent)`) |
| ARMED pill | [popup.tsx:496-515](../src/popup.tsx#L496-L515) | `StatusPill` | Armed/standby | Yes | Yes |
| fullscreen btn | [popup.tsx:479-494](../src/popup.tsx#L479-L494) | `WindowControlButton` | Window controls | Yes | Yes (move inline SVG into icon set) |
| tab switcher | [popup.tsx:519-539](../src/popup.tsx#L519-L539) | `ModeTabs` | Status/Radar | Yes | Yes |
| `ScoreChart` | [src/components/ScoreChart.tsx](../src/components/ScoreChart.tsx) | `ScoreInstrument` | Score gauge | Yes (rAF, reduced-motion) | Yes (recolor, drop glow/jitter) |
| tier pill | [ScoreChart.tsx:165-170](../src/components/ScoreChart.tsx#L165-L170) | `ProtectionBadge` | Protected/exposed | Yes | Yes |
| proof line | [ScoreChart.tsx:172-177](../src/components/ScoreChart.tsx#L172-L177) | `MicroMetricRow` | wabik · masek | Yes | Yes |
| `Card` | [StatCards.tsx:11-40](../src/components/StatCards.tsx#L11-L40) | `MetricCard` | Metric tile | Yes | Yes (neutralize colors) |
| `AiDeepDiveCard` | [src/components/AiDeepDiveCard.tsx](../src/components/AiDeepDiveCard.tsx) | `ThreatRiskCard` | Risk card | Yes | Yes (unify red) |
| score block | [AiDeepDiveCard.tsx:90-95](../src/components/AiDeepDiveCard.tsx#L90-L95) | `RiskScoreMeter` | Risk score | Yes | Yes |
| categories row | [AiDeepDiveCard.tsx:83-89](../src/components/AiDeepDiveCard.tsx#L83-L89) | `TopicSignalRow` | Detected topics | Yes | Yes |
| max-camo line | [AiDeepDiveCard.tsx:98-102](../src/components/AiDeepDiveCard.tsx#L98-L102) | `CountermeasureLine` | Active countermeasures | Yes | Yes |
| icon chips | various (`bg ${color}1a`) | `IconFrame` | Consistent glyph frame | n/a | Yes (one frame primitive) |
| metadata/footer text | [popup.tsx:645-647](../src/popup.tsx#L645-L647), [AiDeepDiveCard.tsx:86-88](../src/components/AiDeepDiveCard.tsx#L86-L88) | `DebugMetadata` | Debug/metadata | Yes | Yes |
| floating panel | [floatingWindow.ts:275-325](../src/content/floatingWindow.ts#L275-L325) | `FloatingPanelFrame` | On-page panel frame | Yes (DOM/drag/Shadow) | Yes (token-align CSS) |

---

## 10. Handcrafted Icon System

**Good news:** the icon set is already hand-built inline SVG with no icon-font
and no network dependency ([src/components/icons.tsx](../src/components/icons.tsx)) —
24px grid, `currentColor`, round caps. The redesign **finishes and unifies** it
rather than replacing it.

Cleanups required:
- `Logo` hardcodes `stroke="var(--accent)"` (teal) on the iris + dagger
  ([icons.tsx:47-52](../src/components/icons.tsx#L47-L52)) — make it inherit
  `currentColor` so the brand mark obeys the new red/white identity.
- The fullscreen expand glyph is an inline `<svg>` in
  [popup.tsx:485-493](../src/popup.tsx#L485-L493) — promote to the icon set as
  `Expand` so all glyphs live in one file.
- Floating window/side panel use text glyphs `–` `×` `▸` `●` instead of SVG
  ([floatingWindow.ts:291-339](../src/content/floatingWindow.ts#L291-L339)) — replace
  with shared SVG for cohesion.

| Icon | Meaning | Suggested Geometry | Stroke / Fill Rules | Component |
|---|---|---|---|---|
| shield mark | brand / protection | shield outline + iris + dagger slash | `currentColor`, 1.5 stroke, round join | `BrandMark` (from `Logo`) |
| dagger reference | brand secondary | diagonal slash through iris | `currentColor` (remove teal) | inside `BrandMark` |
| armed indicator | armed state | shield + filled dot or bolt | red `currentColor` when armed | `StatusPill` |
| protected indicator | protected | shield + check | near-white `currentColor` | `ProtectionBadge` (from `ShieldCheck`) |
| decoy / ghost | decoy traffic | calm ghost (existing) | neutral `currentColor` | `MetricCard` (from `Ghost`) |
| fingerprint mask | shadow audit | whorl (existing) | neutral, red on high entropy | `ShadowAudit` (from `Fingerprint`) |
| radar / network | radar tab | concentric aperture (existing) | `currentColor` | `ModeTabs` (from `Aperture`) |
| critical risk | critical | shield + exclamation (existing) | red `currentColor` | `ThreatRiskCard` (from `ShieldAlert`) |
| expand / window | fullscreen | corner-brackets (inline today) | `currentColor`, 1.4 stroke | `WindowControlButton` (new `Expand`) |
| status dot | live state | filled circle | red armed / muted standby | `StatusPill` |

Rules: no emoji, no cartoon ghosts, no clip-art, no third-party icon dumping.
Any temporary third-party glyph must be marked `// PLACEHOLDER`. Final identity
is local handcrafted SVG components in one file.

---

## 11. Motion and Interaction Direction

**Current:** `.stagger` entrance (55ms index delay), `heroPulse` 2.4s infinite
glow on the score ring, `ringPing` on the status dot, `drift` jitter particles,
toggle overshoot `cubic-bezier(0.34,1.56,0.64,1)`, full `prefers-reduced-motion`
net ([style.css:253-299](../src/style.css#L253-L299)). The named easings/durations
in [tailwind.config.js:98-109](../tailwind.config.js#L98-L109) are good — keep them.

Redesign rules: short transitions, restrained hover lift, precise active states,
**no constant pulsing unless real danger**, no looping decoration, red pressure
only on critical, score ring animates **only on value change**.

| Element | Interaction | Motion Rule | Duration | Easing | Notes |
|---|---|---|---|---|---|
| Panel mount | entrance | translateY+fade, staggered | 380ms / 55ms step | `enter` | Keep `.stagger` |
| Score ring | value change | dash-offset tween | 800ms | `cubic-bezier(0.05,0.7,0.1,1)` | Keep; **remove `heroPulse` idle glow** |
| Score number | value change | rAF roll-up | 800ms | ease-out cubic | Keep ([ScoreChart.tsx:67-90](../src/components/ScoreChart.tsx#L67-L90)) |
| Status pill (armed) | state | dot pulse | 2s | `standard` | **Only when armed**, subtle |
| Risk card (critical) | enter critical | one-shot red border bloom | 600ms | `enter` | Replaces infinite glow |
| Jitter field | — | remove | — | — | Theatrical, no data value |
| Card | hover | translateY(-2px) | 220ms | `standard` | Keep |
| Toggle | switch | knob slide | 220ms | `overshoot` | Keep |
| Tab | switch | underline slide | 150ms | `standard` | Recolor |
| Floating panel | open/close | fast, solid | 140ms | `snap` | No bounce |

Reduced-motion net must remain ([style.css:286-299](../src/style.css#L286-L299)).

---

## 12. State System

Triggers grounded in current code where possible; unknowns marked.

| State | Visual Treatment | Copy | Component Impact | Data Trigger |
|---|---|---|---|---|
| armed | red status dot + ARMED | ARMED / UZBROJONO | `StatusPill` red | `anyEnabled === true` ([popup.tsx:441-446](../src/popup.tsx#L441-L446)) |
| disarmed / standby | muted dot + STANDBY | STANDBY / CZUWANIE | `StatusPill` gray | `anyEnabled === false` |
| protected | near-white badge | PROTECTED / CHRONIONY | `ProtectionBadge` calm | `tier === "protected"` (score ≥70) |
| guarded | amber badge | GUARDED / OGRANICZONY | `ProtectionBadge` warn | `tier === "guarded"` (40–69) |
| exposed | red badge | EXPOSED / NARAŻONY | `ProtectionBadge` red | `tier === "exposed"` (<40) |
| risk: medium | amber accent | MED | `ThreatRiskCard` warn | `risk.level === "medium"` ([AiDeepDiveCard.tsx:9-14](../src/components/AiDeepDiveCard.tsx#L9-L14)) |
| risk: high/critical | red border + bloom | HIGH / CRITICAL | `ThreatRiskCard` red | `risk.level` high/critical |
| scanning | spinner / "skanuję…" | skanuję… | floating subtext | `deepScanStatus === "loading"` ([floatingWindow.ts:512-521](../src/content/floatingWindow.ts#L512-L521)) |
| no page data | muted empty | Czekam na raport tej strony | `ThreatRiskCard` neutral | `risk == null` ([AiDeepDiveCard.tsx:43-44](../src/components/AiDeepDiveCard.tsx#L43-L44)) |
| DOM blocked | amber notice | Chrome blokuje skan DOM | risk card | `evidenceTags` has `dom_scan_unavailable` |
| sensitive page | amber, scan paused | Skan wstrzymany: strona wrażliwa | floating body | `page.excluded` ([floatingWindow.ts:308-312](../src/content/floatingWindow.ts#L308-L312)) |
| model loading | progress line | Ładowanie modelu… | floating footer | `deepScanStatus === "loading"` |
| heuristic fallback | muted source tag | heuristic | metadata | `risk.model.mode` absent ([AiDeepDiveCard.tsx:86-88](../src/components/AiDeepDiveCard.tsx#L86-L88)) |
| LLM/model error | red status | Błąd modelu… werdykt heurystyczny | floating footer | `deepScanStatus === "error"` ([floatingWindow.ts:544-555](../src/content/floatingWindow.ts#L544-L555)) |
| radar inactive | muted radar | Radar czeka na zdarzenia | radar tab | `honeypotEvents.length === 0` ([popup.tsx:655-662](../src/popup.tsx#L655-L662)) |
| extension unavailable | UNKNOWN_FROM_CODE | — | — | No explicit `chrome`-missing UI path |
| permission required | UNKNOWN_FROM_CODE | — | — | Not modeled in current UI |
| floating focused/unfocused | UNKNOWN_FROM_CODE | — | — | Only collapsed/expanded modeled |

---

## 13. Copywriting System

Current copy mixes Polish UI strings with English labels (e.g. "Active Privacy
Defense", "ARMED", "PROTECTED" alongside "anonimowe zapytania", "Otwórz Side
Panel", "Czekam na raport tej strony"). Pick one direction and apply globally.

**Direction A — Polish-first tactical UI:**

| Slot | Copy |
|---|---|
| app subtitle | AKTYWNA OBRONA PRYWATNOŚCI |
| armed | UZBROJONO |
| protected | CHRONIONY |
| critical risk | Ta treść jest wysoko profilowalna przez AI i trackery |
| decoy traffic | Ruch-wabik · anonimowe zapytania |
| masked signals | Sygnały zamaskowane · powierzchnie fingerprint |
| AI profiling risk | Ryzyko profilowania AI |
| active countermeasures | Pełna kamuflaż: mysz, klawiatura, fingerprint, DataGhost |
| raw metadata | rawTextRetained: false · heurystyka |

**Direction B — English-first premium security UI:**

| Slot | Copy |
|---|---|
| app subtitle | ACTIVE PRIVACY DEFENSE |
| armed | ARMED |
| protected | PROTECTED |
| critical risk | This content is highly profilable by AI and trackers |
| decoy traffic | Decoy traffic · anonymized queries |
| masked signals | Masked signals · fingerprint surfaces |
| AI profiling risk | AI profiling risk |
| active countermeasures | Full camouflage: mouse, keyboard, fingerprint, DataGhost |
| raw metadata | rawTextRetained: false · heuristic |

Rules: no marketing fluff, no "AI-powered magic", no childish copy, no emoji, no
overexplaining — every phrase reads like a serious instrument.

---

## 14. Data Display Contract

| Data | Current Example | Source File / State | Future Display | Empty / Error State |
|---|---|---|---|---|
| privacy score | 100 | `score` ([popup.tsx:256-259](../src/popup.tsx#L256-L259)) | `ScoreInstrument`, mono, roll-up | `0`, standby ring |
| risk score | 100 | `risk.score` ([AiDeepDiveCard.tsx:91-93](../src/components/AiDeepDiveCard.tsx#L91-L93)) | `RiskScoreMeter`, red on high | `0` + "Czekam na raport" |
| decoy / wabik | 459 | `noiseGeneratedCount` | `MetricCard` number, mono tnum | `0` neutral |
| mask count | 18290 | `trackersBlockedCount` | `MetricCard` number, mono tnum | `0` neutral |
| detected topics | (categories) | `risk.categories` ([AiDeepDiveCard.tsx:36-42](../src/components/AiDeepDiveCard.tsx#L36-L42)) | `TopicSignalRow`, truncated | "brak wrażliwych kategorii" |
| rawTextRetained | false | hardcoded string ([AiDeepDiveCard.tsx:86-88](../src/components/AiDeepDiveCard.tsx#L86-L88)) | `DebugMetadata` muted | always present |
| heuristic/model mode | heuristic | `risk.model.mode` | `DebugMetadata` tag | "heuristic" default |
| active camo modules | mysz, klawiatura… | `maxCamoActive` ([AiDeepDiveCard.tsx:98-102](../src/components/AiDeepDiveCard.tsx#L98-L102)) | `CountermeasureLine` | hidden when false |
| armed/protected | ARMED / PROTECTED | `anyEnabled` / `tier` | `StatusPill` / `ProtectionBadge` | STANDBY / EXPOSED |
| status/radar mode | Status | `activeTab` ([popup.tsx:113-127](../src/popup.tsx#L113-L127)) | `ModeTabs` | defaults to Status |

---

## 15. Accessibility Redesign Requirements

Current state is **partial**: some `role="switch"` + `aria-checked` +
`aria-label` exist on the AI toggle/select
([AiDeepDiveCard.tsx:112-145](../src/components/AiDeepDiveCard.tsx#L112-L145)); the
floating bubble has `role="button"`, `tabindex`, keyboard handler, `aria-label`
([floatingWindow.ts:252-270](../src/content/floatingWindow.ts#L252-L270)); icons are
`aria-hidden`. But tabs are plain `<button>` without tab semantics, status/risk
changes are not announced, and several states rely on color alone.

| Component | Current Accessibility | Required Fix | Priority |
|---|---|---|---|
| `ModeTabs` | plain buttons, no roles | `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, arrow-key nav | High |
| `StatusPill` | visual only | `aria-label` "Defense armed/standby"; not color-only | High |
| `ProtectionBadge` | color + icon | ensure text label always present (it is); contrast-check red on black | High |
| `ThreatRiskCard` | static text | `role="status"` / `aria-live="polite"` on level change | High |
| `ScoreInstrument` | visual number | `aria-label` "Privacy score N of 100" | Medium |
| `MetricCard` | visual | label/number associated for SR | Medium |
| Focus rings | inconsistent | global `:focus-visible` using `--color-focus-ring` | High |
| Reduced motion | net exists, keep | preserve [style.css:286-299](../src/style.css#L286-L299) | Done — keep |
| Color-only meaning | risk reds, legend dots | always pair color with text/icon (radar legend uses bare `●`) | High |
| Side panel | inline styles, no roles | add landmarks/labels | Medium |

Red-on-black contrast: `#E5484D` on `#0A0A0B` ≈ 4.0:1 — acceptable for large/UI
text but **borderline for small body**; use white text on red fills, never small
red text on black for critical copy.

---

## 16. Frontend Implementation Rules

The implementation pass must:

- centralize design tokens (CSS vars + Tailwind theme referencing them)
- eliminate magic colors — replace every hardcoded hex in JSX (`#9A8CFF`,
  `#5E8BFF`, `#FF5C7A`, `#FF5C77`, `#FF7A66`, `#2BD4C4` literals)
- eliminate hardcoded spacing — name the px scale
- use reusable components; keep logic separate from visual components
- use typed props (codebase is TS — keep it strict)
- avoid bloated dependencies; icons stay local SVG
- avoid global CSS leaks (popup vs floating Shadow DOM vs side panel)
- respect Chrome-extension constraints; CSP-safe assets only
- work in popup (360px) **and** floating panel (320px) contexts
- avoid layout shift (keep `tnum` tabular numerals)
- avoid expensive animation; support high DPI and narrow widths
- keep all SVG/styles under repo control (no CDN icon fonts)
- **unify the three palettes:** popup Tailwind tokens, floating-window inline CSS
  ([floatingWindow.ts:139-212](../src/content/floatingWindow.ts#L139-L212)), and
  side-panel inline-style objects ([sidepanel.tsx:21-35](../src/sidepanel.tsx#L21-L35))
  must all read from one token source (the floating window needs the tokens
  injected into its Shadow DOM `<style>`).

Preferred file structure (new), adjacent to existing `src/components/`:

```txt
src/ui/
├── components/
│   ├── shell/        AppShell
│   ├── header/       CommandHeader, BrandMark, StatusPill, WindowControlButton
│   ├── status/       ModeTabs, ProtectionBadge
│   ├── metrics/      MetricCard, MicroMetricRow, ScoreInstrument
│   ├── risk/         ThreatRiskCard, RiskScoreMeter, TopicSignalRow, CountermeasureLine
│   ├── icons/        (consolidate src/components/icons.tsx + Expand glyph)
│   └── primitives/   IconFrame, DebugMetadata
├── styles/
│   ├── tokens.css        (Section 6 CSS)
│   ├── typography.css    (Section 7 scale)
│   ├── motion.css        (keyframes migrated from src/style.css)
│   └── surfaces.css      (card/border/shadow recipes)
└── screens/
    ├── PopupPanel.tsx     (refactor of src/popup.tsx view layer)
    ├── FloatingPanel.tsx  (token-aligned render for floatingWindow.ts)
    └── RadarPanel.tsx     (extract radar tab)
```

Migration note: keep [src/popup.tsx](../src/popup.tsx) as the stateful entry that
renders `PopupPanel`; do not move the message bus / storage / score logic.

---

## 17. Premium Redesign Acceptance Checklist

- [ ] Looks serious in black/red/white without relying on cheap glow
- [ ] Every icon is intentional and consistent (one local SVG file)
- [ ] No emojis
- [ ] No generic AI-SaaS cards
- [ ] No fake cyberpunk noise
- [ ] No random gradients (teal score gradient removed/demoted)
- [ ] No layout element exists only because it "looks cool" (jitter field gone)
- [ ] Score area reads instantly
- [ ] Critical risk state feels urgent but not hysterical (one-shot, not looping)
- [ ] Status/armed/protected states are unambiguous and not color-only
- [ ] Typography feels premium and controlled (named scale, no raw px sprawl)
- [ ] Spacing is consistent (tokenized)
- [ ] Component boundaries are reusable (`src/ui/`)
- [ ] Data states handled (loading/empty/error/sensitive)
- [ ] Accessibility basics not ignored (tabs, live regions, focus rings)
- [ ] Popup (360px) and floating panel (320px) both work
- [ ] Three palettes unified to one token source
- [ ] The UI looks handcrafted, not generated

---

## 18. Design Debt Found In Current Code

| Debt | File / Component | Severity | Why It Matters | Suggested Fix |
|---|---|---|---|---|
| Three palettes (Tailwind / inline / style-object) | popup vs [floatingWindow.ts](../src/content/floatingWindow.ts) vs [sidepanel.tsx](../src/sidepanel.tsx) | High | Same product looks like three apps; floating bg `#0E1116` ≠ popup `#0A0B0E` | One token source; inject vars into Shadow DOM |
| Inconsistent risk reds | `#FF5C77`/`#FF7A66`/`#FF5C7A`/`#E5484D` | High | "Critical" has no single visual identity | Collapse to `--color-accent-danger` |
| Teal-first identity | [tailwind.config.js:37-42](../tailwind.config.js#L37-L42), `Logo` | High | Generic cyber-SaaS look; conflicts with target | Demote teal to data-only; red brand |
| Hardcoded hex in JSX | [StatCards.tsx:47-58](../src/components/StatCards.tsx#L47-L58), [popup.tsx:508-588](../src/popup.tsx#L508-L588) | High | Can't theme; magic colors | Replace with tokens |
| Raw px font sizes everywhere | popup/cards `text-[9px]`…`[26px]` | Med | No type system; drift | Named typography scale |
| Perpetual decorative motion | `heroPulse`, jitter `drift`, `ringPing` | Med | Reads cheap; battery/attention cost | Animate on state change only |
| `Logo` hardcodes teal stroke | [icons.tsx:47-52](../src/components/icons.tsx#L47-L52) | Med | Brand mark ignores theme | Use `currentColor` |
| Inline SVG outside icon set | [popup.tsx:485-493](../src/popup.tsx#L485-L493) | Low | Icon sprawl | Promote to `Expand` |
| Text glyphs as icons | `–` `×` `▸` `●` in floating/side/radar | Med | Inconsistent with SVG set | Shared SVG |
| Mixed PL/EN copy | throughout | Med | Reads unfinished | Pick Section 13 direction |
| Debug text in premium card | `rawTextRetained: false · heuristic` ([AiDeepDiveCard.tsx:86-88](../src/components/AiDeepDiveCard.tsx#L86-L88)) | Med | Forensic noise in hero card | Move to `DebugMetadata` footer |
| Tabs lack a11y semantics | [popup.tsx:523-538](../src/popup.tsx#L523-L538) | High | No tab roles / keyboard | `tablist`/`tab`/`tabpanel` |
| Color-only radar legend | [popup.tsx:669-678](../src/popup.tsx#L669-L678) | Med | Meaning by color alone | Add text/icon |
| Side panel zero a11y | [sidepanel.tsx](../src/sidepanel.tsx) | Med | No landmarks/labels | Add roles |

Do not fix here — fix in the implementation pass.

---

## 19. Claude Design Prompt For Next Pass

# NEXT PROMPT: Premium UI Redesign Implementation

```md
You are implementing the premium Cloak & Dagger UI redesign.

Before editing code:
1. Read docs/CLAUDE_DESIGN_HANDOFF.md in full.
2. Inspect the current UI: src/popup.tsx, src/components/* (AiDeepDiveCard,
   ScoreChart, StatCards, ShadowAudit, icons, ModuleToggles, LoggerView,
   PanicButton, VirtualIdentity, CyberRadar), src/style.css, tailwind.config.js,
   src/content/floatingWindow.ts, src/sidepanel.tsx.
3. Preserve ALL business logic and data flow — the message bus, storage keys,
   computePrivacyScore/deriveTier, rAF roll-up, reduced-motion net, Shadow DOM
   mount/drag, and per-origin persistence must stay intact.
4. Replace only the visual/component layer. Logic cleanup only where required for
   clean component boundaries.

Mission: redesign into a premium black/red/white privacy command panel where RED
means risk and armed, and nothing glows unless something is actually wrong.

Hard rules: no emojis; no AI-SaaS look; no neon cyberpunk; no generic glass
cards; no random gradients; no cartoon icons; no icon-pack dumping; no fake
terminal aesthetic; no decorative motion without a state trigger; do not break
popup/floating/side-panel behavior; stay CSP-safe.

Build:
- src/ui/styles/tokens.css with the Section 6 variables (red-first).
- Migrate every hardcoded hex in JSX and every inline/style-object palette
  (floatingWindow.ts, sidepanel.tsx) to those tokens; inject the vars into the
  floating window's Shadow DOM <style>.
- Named typography scale (Section 7) replacing raw px.
- These components (keep logic, replace visuals): AppShell, CommandHeader,
  BrandMark, StatusPill, WindowControlButton, ModeTabs, ScoreInstrument,
  ProtectionBadge, MicroMetricRow, MetricCard, ThreatRiskCard, RiskScoreMeter,
  TopicSignalRow, CountermeasureLine, IconFrame, DebugMetadata, FloatingPanelFrame.
- Consolidate icons into one local SVG file; add an Expand glyph; remove the
  teal stroke from the brand mark (use currentColor); replace text-glyph icons.
- Remove the score ring's infinite heroPulse glow and the jitter particle field;
  animate the ring only on value change.
- Accessibility: tablist/tab/tabpanel + arrow nav on ModeTabs; aria-live on risk
  level change; aria-label on score/status; global :focus-visible ring; no
  color-only meaning (fix radar legend).

Keep these dynamic values wired exactly as today: privacy score, risk score,
wabik count, mask count, armed/protected state, risk topics, heuristic/
rawTextRetained metadata, active camo modules, status/radar tab.

After implementation, output:
- list of changed files
- component architecture explanation
- which logic was preserved and how
- the visual system (tokens/typography/motion) summary
- remaining debt
- manual test steps for popup (360px) and floating panel (320px)
```

---

## 20. Final Source Of Truth Summary

- **Product identity:** a local-first, defensive privacy command instrument —
  serious, compact, trustworthy; not a toy/adblock/cyber-SaaS/AI-assistant panel.
- **Target visual style:** matte black base, deep charcoal surfaces, near-white
  text, **one signal red** for risk + armed, muted gray metadata, hairline
  borders, controlled shadows; teal demoted to a data-only legacy accent.
- **Core components:** AppShell, CommandHeader, BrandMark, StatusPill,
  WindowControlButton, ModeTabs, ScoreInstrument, ProtectionBadge,
  MicroMetricRow, MetricCard, ThreatRiskCard, RiskScoreMeter, TopicSignalRow,
  CountermeasureLine, IconFrame, DebugMetadata, FloatingPanelFrame.
- **Design tokens:** Section 6 — red-first `--color-accent-*`, near-black
  `--color-bg-*`, white/gray text ramp, single danger red `#E5484D`, focus ring,
  one shadow recipe; one source feeding popup + floating Shadow DOM + side panel.
- **Typography rules:** Inter + system mono; named scale (Section 7); mono+tnum
  for all numbers; uppercase+tracking only on labels/badges; no raw-px sprawl.
- **Interaction rules:** short transitions; hover lift; score animates on value
  change only; **no perpetual pulse/jitter**; critical = one-shot red bloom;
  reduced-motion net preserved.
- **Accessibility:** tab semantics, aria-live risk alerts, score/status labels,
  visible `:focus-visible` rings, no color-only meaning, white-on-red for
  critical copy.
- **Implementation constraints:** TS strict, local SVG only, CSP-safe, works at
  360px (popup) and 320px (floating), no layout shift, no bloated deps, three
  palettes unified.
- **Anti-slop rules:** no emoji, no cheap glow, no rainbow gradients, no generic
  cards, no cartoon/icon-pack icons, no "AI magic" copy, no cyberpunk template
  trash, no fake terminal aesthetic, no decorative element without function, no
  hardcoded color/spacing chaos.
