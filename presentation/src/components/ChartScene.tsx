import { useEffect, useRef } from "react"
import * as Plot from "@observablehq/plot"
import { useInView, useReducedMotion } from "../engine/hooks"
import type { ChartLayer } from "../story/types"

const ACCENT = "#d8352b"
const STEEL = "#6f8fa6"
const INK = "#c7c9ce"

/**
 * ChartScene — Observable Plot bar chart with a staged reveal:
 *   axes/grid render immediately, bars grow horizontally on enter,
 *   the annotation fades in last. No-animation fallback under reduced motion.
 */
export function ChartScene({ layer }: { layer: ChartLayer }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.35 })
  const reduced = useReducedMotion()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.replaceChildren()

    // best = lowest value when lowerIsBetter
    const best = layer.series.reduce((a, b) => (b.value < a.value ? b : a))
    const data = layer.series.map((d) => ({
      name: d.name,
      value: d.value,
      label: `${d.value} ${d.unit ?? ""}`.trim(),
      isBest: layer.lowerIsBetter ? d === best : false,
    }))

    const chart = Plot.plot({
      width: 640,
      height: 240,
      marginLeft: 18,
      marginRight: 70,
      marginBottom: 38,
      style: { background: "transparent", color: INK, fontSize: "12px" },
      x: { label: layer.series[0]?.unit ?? "wartość", grid: true, nice: true },
      y: { label: null, axis: null },
      marks: [
        Plot.barX(data, {
          y: "name",
          x: "value",
          fill: (d: { isBest: boolean }) => (d.isBest ? ACCENT : STEEL),
          rx: 1,
          insetTop: 10,
          insetBottom: 10,
        }),
        Plot.text(data, {
          y: "name",
          x: "value",
          text: "label",
          dx: 8,
          textAnchor: "start",
          fill: "#f3f1ea",
          fontWeight: 600,
        }),
        Plot.text(data, {
          y: "name",
          frameAnchor: "left",
          text: "name",
          dy: -22,
          dx: 2,
          textAnchor: "start",
          fill: INK,
          fontSize: 11,
        }),
        Plot.ruleX([0], { stroke: "#4a505b" }),
      ],
    })

    chart.classList.add("cd-plot")
    host.append(chart)

    // staged grow-in: scale bars from 0 → 1 on the x axis
    const bars = host.querySelectorAll<SVGRectElement>(`rect[fill="${ACCENT}"], rect[fill="${STEEL}"]`)
    bars.forEach((b, i) => {
      b.style.transformBox = "fill-box"
      b.style.transformOrigin = "left center"
      if (reduced) return
      b.style.transform = "scaleX(0)"
      b.style.transition = `transform 1100ms cubic-bezier(0.16,1,0.3,1) ${120 + i * 220}ms`
    })
  }, [layer, reduced])

  // trigger grow when scrolled into view
  useEffect(() => {
    if (!inView || reduced) return
    const host = hostRef.current
    if (!host) return
    const bars = host.querySelectorAll<SVGRectElement>(`rect[fill="${ACCENT}"], rect[fill="${STEEL}"]`)
    requestAnimationFrame(() => bars.forEach((b) => (b.style.transform = "scaleX(1)")))
  }, [inView, reduced])

  return (
    <div className="chart-host" ref={ref}>
      <h3 className="chart-title">{layer.title}</h3>
      <p className="chart-q">{layer.question}</p>
      <div ref={hostRef} aria-label={layer.a11y} role="img" />
      {layer.annotation && (
        <div
          className="callout"
          style={{ marginTop: "var(--s-4)", opacity: inView || reduced ? 1 : 0, transition: "opacity 700ms ease 900ms" }}
        >
          {layer.annotation}
        </div>
      )}
      {layer.source && <div className="chart-source">{layer.source}</div>}
    </div>
  )
}
