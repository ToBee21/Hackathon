// src/components/CyberRadar.tsx
// Moduł C+ — "Cyber Radar View": sci-fi 2D Canvas threat visualisation.
//
// Renders an animated radar (concentric rings, sweep line, grid) with:
//   • Central USER node (teal glow when armed)
//   • Tracker blips (red dots) spawning from the perimeter
//   • Shield aura that neutralises blips (→ gray, bounced outward)
//   • Noise-injection flashes (violet ghost pulses)
//
// Zero external dependencies — pure Canvas 2D + requestAnimationFrame.
// Design language: "Stealth Intelligence Console" tokens from tailwind.config.js / style.css.

import { useCallback, useEffect, useRef, useState, type FC } from "react"

// ─── Colour tokens (mirroring tailwind.config.js) ───────────────────────────

const C = {
  void:        "#0A0B0E",
  surface0:    "#101218",
  surface1:    "#15171F",
  surface2:    "#1B1E27",
  accent:      "#2BD4C4",
  accentGlow:  "rgba(43,212,196,0.45)",
  accentDim:   "rgba(43,212,196,0.12)",
  ghost:       "#9A8CFF",
  ghostGlow:   "rgba(154,140,255,0.40)",
  danger:      "#E5484D",
  dangerGlow:  "rgba(229,72,77,0.50)",
  warn:        "#F5A623",
  neutral:     "#6E7480",
  neutralDim:  "rgba(110,116,128,0.30)",
  fgHi:        "#ECEDEF",
  fgMid:       "#A3A8B4",
  fgLow:       "#6E7480",
  line:        "rgba(255,255,255,0.06)",
  lineStrong:  "rgba(255,255,255,0.10)",
} as const

// ─── Tracker blip model ─────────────────────────────────────────────────────

interface Blip {
  id: number
  /** Angle in radians on the radar */
  angle: number
  /** Normalised distance from centre (0 = centre, 1 = rim) */
  dist: number
  /** Target distance — where the blip wants to reach */
  targetDist: number
  /** Speed factor (normalised dist per second) */
  speed: number
  /** "alive" → approaching, "neutralised" → fading/bouncing, "dead" → remove */
  state: "alive" | "neutralised" | "dead"
  /** Remaining opacity (1 → 0) */
  opacity: number
  /** Visual radius */
  radius: number
  /** Timestamp of state change */
  stateChangedAt: number
  /** Label shown on hover/near (tracker domain) */
  label: string
}

// ─── Noise flash (ghost pulse) ──────────────────────────────────────────────

interface GhostPulse {
  angle: number
  dist: number
  opacity: number
  radius: number
  born: number
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface CyberRadarProps {
  /** Is the protection system armed? Controls shield visibility. */
  armed: boolean
  /** Number of trackers blocked — drives blip spawn rate. */
  trackerCount: number
  /** Number of noise injections — drives ghost pulse spawns. */
  noiseCount: number
  /** Canvas size in CSS pixels (square). Defaults to 280. */
  size?: number
}

// ─── Fake tracker domains for visual flavour ────────────────────────────────

const TRACKER_DOMAINS = [
  "doubleclick.net", "facebook.com", "google-analytics.com",
  "hotjar.com", "segment.io", "criteo.com", "taboola.com",
  "outbrain.com", "adnxs.com", "demdex.net", "mixpanel.com",
  "amplitude.com", "hubspot.com", "marketo.net", "pardot.com",
  "linkedin.com", "twitter.com", "pinterest.com", "tiktok.com",
  "snapchat.com", "bing.com", "yandex.ru", "baidu.com",
]

function randomDomain(): string {
  return TRACKER_DOMAINS[Math.floor(Math.random() * TRACKER_DOMAINS.length)]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let _blipId = 0
function nextBlipId() { return ++_blipId }

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

// ─── Component ──────────────────────────────────────────────────────────────

const CyberRadar: FC<CyberRadarProps> = ({
  armed,
  trackerCount,
  noiseCount,
  size = 280,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blipsRef = useRef<Blip[]>([])
  const ghostsRef = useRef<GhostPulse[]>([])
  const sweepAngleRef = useRef(0)
  const lastTimeRef = useRef(0)
  const rafRef = useRef(0)
  const prevTrackerRef = useRef(trackerCount)
  const prevNoiseRef = useRef(noiseCount)
  const [hovered, setHovered] = useState<string | null>(null)

  // Shield radius (normalised 0–1). Animates up/down with armed state.
  const shieldRef = useRef(armed ? 0.38 : 0)
  const shieldTargetRef = useRef(armed ? 0.38 : 0)

  // Keep armed ref current for the render loop
  const armedRef = useRef(armed)
  useEffect(() => {
    armedRef.current = armed
    shieldTargetRef.current = armed ? 0.38 : 0
  }, [armed])

  // Spawn blips when trackerCount increases
  useEffect(() => {
    const diff = trackerCount - prevTrackerRef.current
    prevTrackerRef.current = trackerCount
    if (diff <= 0) return
    const toSpawn = Math.min(diff, 5) // cap burst
    for (let i = 0; i < toSpawn; i++) {
      const angle = Math.random() * Math.PI * 2
      blipsRef.current.push({
        id: nextBlipId(),
        angle,
        dist: 0.92 + Math.random() * 0.08,
        targetDist: 0.08 + Math.random() * 0.25,
        speed: 0.06 + Math.random() * 0.08,
        state: "alive",
        opacity: 1,
        radius: 2.5 + Math.random() * 2,
        stateChangedAt: performance.now(),
        label: randomDomain(),
      })
    }
  }, [trackerCount])

  // Spawn ghost pulses when noiseCount increases
  useEffect(() => {
    const diff = noiseCount - prevNoiseRef.current
    prevNoiseRef.current = noiseCount
    if (diff <= 0) return
    for (let i = 0; i < Math.min(diff, 3); i++) {
      ghostsRef.current.push({
        angle: Math.random() * Math.PI * 2,
        dist: 0.15 + Math.random() * 0.4,
        opacity: 0.9,
        radius: 4,
        born: performance.now(),
      })
    }
  }, [noiseCount])

  // Auto-spawn blips periodically for demo / idle state
  useEffect(() => {
    const interval = setInterval(() => {
      if (blipsRef.current.length < 18) {
        const angle = Math.random() * Math.PI * 2
        blipsRef.current.push({
          id: nextBlipId(),
          angle,
          dist: 0.95,
          targetDist: 0.1 + Math.random() * 0.28,
          speed: 0.04 + Math.random() * 0.06,
          state: "alive",
          opacity: 1,
          radius: 2 + Math.random() * 2.5,
          stateChangedAt: performance.now(),
          label: randomDomain(),
        })
      }
    }, 1800 + Math.random() * 1200)
    return () => clearInterval(interval)
  }, [])

  // Auto-spawn ghost pulses periodically when armed
  useEffect(() => {
    const interval = setInterval(() => {
      if (armedRef.current && ghostsRef.current.length < 6) {
        ghostsRef.current.push({
          angle: Math.random() * Math.PI * 2,
          dist: 0.12 + Math.random() * 0.35,
          opacity: 0.7,
          radius: 3 + Math.random() * 3,
          born: performance.now(),
        })
      }
    }, 2600 + Math.random() * 1500)
    return () => clearInterval(interval)
  }, [])

  // ── Main render loop ────────────────────────────────────────────────────
  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = size
    const h = size
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cx = w / 2
    const cy = h / 2
    const maxR = Math.min(cx, cy) - 8 // radar radius

    const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016
    lastTimeRef.current = timestamp

    // Animate shield radius
    shieldRef.current = lerp(shieldRef.current, shieldTargetRef.current, clamp(dt * 3.5, 0, 1))
    const shieldR = shieldRef.current * maxR

    // Sweep rotation (one full revolution every ~4s)
    sweepAngleRef.current = (sweepAngleRef.current + dt * 1.57) % (Math.PI * 2)
    const sweep = sweepAngleRef.current

    // ── Clear ──
    ctx.clearRect(0, 0, w, h)

    // ── Background radial glow ──
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.1)
    bgGrad.addColorStop(0, C.surface1)
    bgGrad.addColorStop(0.7, C.surface0)
    bgGrad.addColorStop(1, C.void)
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, w, h)

    // ── Concentric rings ──
    const rings = [0.25, 0.5, 0.75, 1.0]
    for (const r of rings) {
      ctx.beginPath()
      ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2)
      ctx.strokeStyle = C.line
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // ── Cross-hair lines ──
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 4) * (i * 2)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR)
      ctx.stroke()
    }

    // ── Sweep line + trail ──
    // (conic gradient intentionally omitted — limited support; radial trail below)

    // Sweep trail (wedge gradient)
    ctx.save()
    ctx.globalAlpha = 0.12
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, maxR, sweep - 0.55, sweep)
    ctx.closePath()
    const trailGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
    trailGrad.addColorStop(0, armedRef.current ? C.accentGlow : C.neutralDim)
    trailGrad.addColorStop(1, "transparent")
    ctx.fillStyle = trailGrad
    ctx.fill()
    ctx.restore()

    // Sweep leading edge
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(sweep) * maxR, cy + Math.sin(sweep) * maxR)
    ctx.strokeStyle = armedRef.current ? C.accent : C.neutral
    ctx.globalAlpha = 0.6
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()

    // ── Shield aura ──
    if (shieldRef.current > 0.01) {
      ctx.save()

      // Outer glow
      ctx.beginPath()
      ctx.arc(cx, cy, shieldR + 6, 0, Math.PI * 2)
      ctx.strokeStyle = C.accentGlow
      ctx.lineWidth = 8
      ctx.globalAlpha = 0.08 + 0.04 * Math.sin(timestamp * 0.002)
      ctx.stroke()

      // Shield ring
      ctx.beginPath()
      ctx.arc(cx, cy, shieldR, 0, Math.PI * 2)
      ctx.strokeStyle = C.accent
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.5 + 0.15 * Math.sin(timestamp * 0.003)
      ctx.stroke()

      // Shield fill
      const shieldGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, shieldR)
      shieldGrad.addColorStop(0, "rgba(43,212,196,0.03)")
      shieldGrad.addColorStop(0.8, "rgba(43,212,196,0.06)")
      shieldGrad.addColorStop(1, "rgba(43,212,196,0.01)")
      ctx.fillStyle = shieldGrad
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(cx, cy, shieldR, 0, Math.PI * 2)
      ctx.fill()

      // Segmented shield arcs (sci-fi detail)
      const segments = 8
      for (let i = 0; i < segments; i++) {
        const segStart = (Math.PI * 2 / segments) * i + timestamp * 0.0004
        const segEnd = segStart + (Math.PI * 2 / segments) * 0.7
        ctx.beginPath()
        ctx.arc(cx, cy, shieldR - 2, segStart, segEnd)
        ctx.strokeStyle = C.accentDim
        ctx.lineWidth = 3
        ctx.globalAlpha = 0.3 + 0.1 * Math.sin(timestamp * 0.002 + i)
        ctx.stroke()
      }

      ctx.restore()
    }

    // ── Update & draw blips ──
    const blips = blipsRef.current
    for (let i = blips.length - 1; i >= 0; i--) {
      const b = blips[i]

      if (b.state === "alive") {
        // Move toward centre
        b.dist = lerp(b.dist, b.targetDist, clamp(dt * b.speed * 12, 0, 1))

        // Check shield collision
        if (armedRef.current && b.dist * maxR <= shieldR + 4) {
          b.state = "neutralised"
          b.stateChangedAt = timestamp
          b.targetDist = 0.85 + Math.random() * 0.15 // bounce outward
          b.speed *= 1.8
        }
      } else if (b.state === "neutralised") {
        // Bounce outward and fade
        b.dist = lerp(b.dist, b.targetDist, clamp(dt * b.speed * 10, 0, 1))
        const elapsed = (timestamp - b.stateChangedAt) / 1000
        b.opacity = Math.max(0, 1 - elapsed * 0.7)
        if (b.opacity <= 0.01) b.state = "dead"
      }

      if (b.state === "dead") {
        blips.splice(i, 1)
        continue
      }

      // Draw blip
      const bx = cx + Math.cos(b.angle) * b.dist * maxR
      const by = cy + Math.sin(b.angle) * b.dist * maxR

      ctx.save()
      ctx.globalAlpha = b.opacity

      if (b.state === "alive") {
        // Red glow
        const glowGrad = ctx.createRadialGradient(bx, by, 0, bx, by, b.radius * 4)
        glowGrad.addColorStop(0, C.dangerGlow)
        glowGrad.addColorStop(1, "transparent")
        ctx.fillStyle = glowGrad
        ctx.fillRect(bx - b.radius * 4, by - b.radius * 4, b.radius * 8, b.radius * 8)

        // Red dot
        ctx.beginPath()
        ctx.arc(bx, by, b.radius, 0, Math.PI * 2)
        ctx.fillStyle = C.danger
        ctx.fill()

        // Pulsing ring on alive blips
        const pulse = 1 + 0.3 * Math.sin(timestamp * 0.005 + b.id)
        ctx.beginPath()
        ctx.arc(bx, by, b.radius * pulse * 1.8, 0, Math.PI * 2)
        ctx.strokeStyle = C.danger
        ctx.lineWidth = 0.8
        ctx.globalAlpha = b.opacity * 0.3
        ctx.stroke()
      } else {
        // Neutralised — gray, shrinking
        ctx.beginPath()
        ctx.arc(bx, by, b.radius * 0.7, 0, Math.PI * 2)
        ctx.fillStyle = C.neutral
        ctx.fill()
      }

      ctx.restore()
    }

    // ── Ghost pulses (noise injection flashes) ──
    const ghosts = ghostsRef.current
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i]
      const elapsed = (timestamp - g.born) / 1000

      g.opacity = Math.max(0, 0.9 - elapsed * 1.2)
      g.radius = 4 + elapsed * 18

      if (g.opacity <= 0.01) {
        ghosts.splice(i, 1)
        continue
      }

      const gx = cx + Math.cos(g.angle) * g.dist * maxR
      const gy = cy + Math.sin(g.angle) * g.dist * maxR

      ctx.save()
      ctx.globalAlpha = g.opacity * 0.6

      const ghostGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, g.radius)
      ghostGrad.addColorStop(0, C.ghostGlow)
      ghostGrad.addColorStop(0.6, "rgba(154,140,255,0.10)")
      ghostGrad.addColorStop(1, "transparent")
      ctx.fillStyle = ghostGrad
      ctx.beginPath()
      ctx.arc(gx, gy, g.radius, 0, Math.PI * 2)
      ctx.fill()

      // Tiny core dot
      ctx.beginPath()
      ctx.arc(gx, gy, 2, 0, Math.PI * 2)
      ctx.fillStyle = C.ghost
      ctx.globalAlpha = g.opacity
      ctx.fill()

      ctx.restore()
    }

    // ── Central user node ──
    ctx.save()
    // Outer glow
    const userGlowR = 14 + 2 * Math.sin(timestamp * 0.003)
    const userGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, userGlowR)
    if (armedRef.current) {
      userGrad.addColorStop(0, "rgba(43,212,196,0.35)")
      userGrad.addColorStop(1, "transparent")
    } else {
      userGrad.addColorStop(0, "rgba(110,116,128,0.25)")
      userGrad.addColorStop(1, "transparent")
    }
    ctx.fillStyle = userGrad
    ctx.beginPath()
    ctx.arc(cx, cy, userGlowR, 0, Math.PI * 2)
    ctx.fill()

    // Core dot
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fillStyle = armedRef.current ? C.accent : C.fgMid
    ctx.fill()

    // Inner ring
    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    ctx.strokeStyle = armedRef.current ? C.accent : C.fgLow
    ctx.lineWidth = 1.2
    ctx.globalAlpha = 0.6
    ctx.stroke()
    ctx.restore()

    // ── HUD text overlays ──
    ctx.save()
    ctx.font = "600 9px 'Inter', sans-serif"
    ctx.textAlign = "center"
    ctx.fillStyle = C.fgLow
    ctx.globalAlpha = 0.5

    // Ring distance labels
    const labels = ["25%", "50%", "75%"]
    for (let i = 0; i < labels.length; i++) {
      const r = maxR * rings[i]
      ctx.fillText(labels[i], cx + r - 12, cy - 3)
    }

    // Status label
    ctx.font = "700 8px 'Inter', sans-serif"
    ctx.letterSpacing = "0.12em"
    ctx.fillStyle = armedRef.current ? C.accent : C.fgLow
    ctx.globalAlpha = 0.7
    ctx.textAlign = "center"
    ctx.fillText(armedRef.current ? "SHIELD ACTIVE" : "SHIELD DOWN", cx, h - 10)
    ctx.restore()

    // ── Blip count indicator ──
    const aliveCount = blips.filter(b => b.state === "alive").length
    if (aliveCount > 0) {
      ctx.save()
      ctx.font = "700 9px 'Inter', sans-serif"
      ctx.textAlign = "right"
      ctx.fillStyle = C.danger
      ctx.globalAlpha = 0.8
      ctx.fillText(`${aliveCount} THREAT${aliveCount > 1 ? "S" : ""}`, w - 10, 16)
      ctx.restore()
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [size])

  // Start / stop animation loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  // Mouse hover for blip labels
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const cx = size / 2
    const cy = size / 2
    const maxR = Math.min(cx, cy) - 8

    let found: string | null = null
    for (const b of blipsRef.current) {
      if (b.state === "dead") continue
      const bx = cx + Math.cos(b.angle) * b.dist * maxR
      const by = cy + Math.sin(b.angle) * b.dist * maxR
      const dx = mx - bx
      const dy = my - by
      if (dx * dx + dy * dy < 144) { // 12px radius hit area
        found = b.label
        break
      }
    }
    setHovered(found)
  }, [size])

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          cursor: hovered ? "crosshair" : "default",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
      />
      {/* Tooltip */}
      {hovered && (
        <div
          className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md px-2.5 py-1"
          style={{
            background: "rgba(16,18,24,0.92)",
            border: "1px solid rgba(229,72,77,0.30)",
            backdropFilter: "blur(8px)",
          }}
        >
          <span
            style={{
              color: C.danger,
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
              letterSpacing: "0.04em",
            }}
          >
            {hovered}
          </span>
        </div>
      )}
    </div>
  )
}

export default CyberRadar
