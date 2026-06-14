import { ReactNode } from "react"
import { Reveal } from "./Reveal"
import { ChartScene } from "./ChartScene"
import { GraphScene } from "./GraphScene"
import { CodeBlock } from "./CodeBlock"
import { MermaidRenderer } from "./MermaidRenderer"
import type { Layer } from "../story/types"

export const VISUAL_KINDS = new Set(["chart", "graph", "code", "mermaid"])

function multiline(text: string): ReactNode {
  return text.split("\n").map((line, i) => (
    <span key={i} style={{ display: "block" }}>
      {line || " "}
    </span>
  ))
}

/** Renders a textual / structural layer (everything that is not a big visual). */
export function ContentLayer({ layer }: { layer: Layer }) {
  switch (layer.kind) {
    case "eyebrow":
      return <Reveal enter={layer.enter} className="eyebrow">{layer.text}</Reveal>
    case "display":
      return <Reveal enter={layer.enter} as="h1" className="display">{multiline(layer.text)}</Reveal>
    case "heading":
      return <Reveal enter={layer.enter} as="h2" className="headline">{multiline(layer.text)}</Reveal>
    case "subhead":
      return <Reveal enter={layer.enter} as="h3" className="subhead">{multiline(layer.text)}</Reveal>
    case "lead":
      return <Reveal enter={layer.enter} as="p" className="lead">{layer.text}</Reveal>
    case "body":
      return <Reveal enter={layer.enter} as="p" className="body">{layer.text}</Reveal>
    case "note":
      return <Reveal enter={layer.enter} as="p" className="chart-source" style={{ maxWidth: "70ch" }}>{layer.text}</Reveal>
    case "callout":
      return <Reveal enter={layer.enter} className="callout">{layer.text}</Reveal>
    case "list":
      return (
        <Reveal enter={layer.enter} as="ul" className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {layer.items.map((it, i) => (
            <li key={i} className="feature-row" style={{ gridTemplateColumns: "auto 1fr" }}>
              <span className="feature-row__id">{String(i + 1).padStart(2, "0")}</span>
              <span className="feature-row__desc" style={{ color: "var(--ink-1)" }}>{it}</span>
            </li>
          ))}
        </Reveal>
      )
    case "kpis":
      return (
        <Reveal enter={layer.enter} className="kpi-grid">
          {layer.items.map((k, i) => (
            <div className="kpi" key={i}>
              <div className="kpi__value">
                {k.value}
                {k.unit && <span className="unit">{k.unit}</span>}
              </div>
              <div className="kpi__label">{k.label}</div>
              {k.evidence && <div className="kpi__evidence">{k.evidence}</div>}
            </div>
          ))}
        </Reveal>
      )
    case "features":
      return (
        <Reveal enter={layer.enter} as="div">
          {layer.items.map((f) => (
            <div className="feature-row" key={f.id}>
              <span className="feature-row__id">{f.id}</span>
              <span>
                <span className="feature-row__name">{f.name}</span>
                <span className="feature-row__desc" style={{ display: "block", marginTop: 4 }}>{f.oneLiner}</span>
                {f.files && <span className="kpi__evidence" style={{ display: "block", marginTop: 4 }}>{f.files}</span>}
              </span>
            </div>
          ))}
        </Reveal>
      )
    default:
      return null
  }
}

/** Renders a big visual layer (chart / graph / code / mermaid fallback). */
export function VisualLayer({ layer, debug }: { layer: Layer; debug?: boolean }) {
  switch (layer.kind) {
    case "chart":
      return <ChartScene layer={layer} />
    case "graph":
      return (
        <div className="stage" style={{ height: "min(70vh, 640px)" }}>
          <GraphScene layer={layer} debug={debug} />
        </div>
      )
    case "code":
      return <CodeBlock layer={layer} />
    case "mermaid":
      return (
        <div className="stage" style={{ height: "min(70vh, 640px)" }}>
          <MermaidRenderer source={layer.source} />
        </div>
      )
    default:
      return null
  }
}
