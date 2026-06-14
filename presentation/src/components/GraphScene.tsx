import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useInView, useReducedMotion } from "../engine/hooks"
import type { GraphLayer } from "../story/types"

const KIND_LABEL: Record<string, string> = {
  content: "skrypt treści",
  background: "rdzeń",
  offscreen: "offscreen",
  panel: "panel",
  popup: "popup",
  model: "model AI",
  security: "bezpieczeństwo",
}

type CdData = { label: string; kind: string; lit: boolean }

function CdNode({ data }: NodeProps) {
  const d = data as CdData
  return (
    <div className={`rf-node ${d.lit ? "is-lit" : ""}`} data-kind={d.kind}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="rf-node__kind">{KIND_LABEL[d.kind] ?? d.kind}</div>
      <div className="rf-node__name">{d.label}</div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { cd: CdNode }

export function GraphScene({ layer, debug }: { layer: GraphLayer; debug?: boolean }) {
  const reduced = useReducedMotion()
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.4 })
  const [litNodes, setLitNodes] = useState<Set<string>>(new Set())
  const [litEdges, setLitEdges] = useState<Set<string>>(new Set())
  const [tracing, setTracing] = useState(false)

  const baseNodes: Node[] = useMemo(
    () =>
      layer.nodes.map((n) => ({
        id: n.id,
        type: "cd",
        position: { x: n.x, y: n.y },
        data: { label: n.label, kind: n.kind, lit: false },
        draggable: false,
        connectable: false,
        selectable: false,
      })),
    [layer.nodes],
  )

  const baseEdges: Edge[] = useMemo(
    () =>
      layer.edges.map((e) => ({
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        label: e.label,
        animated: false,
        style: { stroke: "#41525f", strokeWidth: 1.4 },
        labelStyle: { fill: "#8b9099", fontFamily: "var(--font-mono)", fontSize: 10 },
        labelBgStyle: { fill: "#0c0e12" },
      })),
    [layer.edges],
  )

  const nodes = useMemo(
    () => baseNodes.map((n) => ({ ...n, data: { ...n.data, lit: litNodes.has(n.id) } })),
    [baseNodes, litNodes],
  )
  const edges = useMemo(
    () =>
      baseEdges.map((e) =>
        litEdges.has(e.id)
          ? { ...e, animated: true, style: { stroke: "#d8352b", strokeWidth: 2.2 }, labelStyle: { fill: "#f3f1ea", fontFamily: "var(--font-mono)", fontSize: 10 } }
          : e,
      ),
    [baseEdges, litEdges],
  )

  const edgeBetween = useCallback(
    (a: string, b: string) =>
      baseEdges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))?.id,
    [baseEdges],
  )

  const runTrace = useCallback(() => {
    const path = layer.tracePath
    if (!path?.length) return
    setTracing(true)
    setLitNodes(new Set())
    setLitEdges(new Set())

    if (reduced) {
      setLitNodes(new Set(path))
      setLitEdges(new Set(path.slice(1).map((p, i) => edgeBetween(path[i], p)).filter(Boolean) as string[]))
      setTracing(false)
      return
    }

    let i = 0
    const step = () => {
      setLitNodes((prev) => new Set(prev).add(path[i]))
      if (i > 0) {
        const eid = edgeBetween(path[i - 1], path[i])
        if (eid) setLitEdges((prev) => new Set(prev).add(eid))
      }
      i += 1
      if (i < path.length) {
        window.setTimeout(step, 620)
      } else {
        window.setTimeout(() => setTracing(false), 600)
      }
    }
    step()
  }, [layer.tracePath, reduced, edgeBetween])

  // auto-run once when scrolled into view
  useEffect(() => {
    if (inView) {
      const t = window.setTimeout(runTrace, 500)
      return () => window.clearTimeout(t)
    }
  }, [inView, runTrace])

  return (
    <div className="graph-host" ref={ref} aria-label={layer.a11y} role="img">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#1c2026" />
      </ReactFlow>

      <button className="trace-btn" onClick={runTrace} disabled={tracing} type="button">
        {tracing ? "Trasowanie…" : "▶ Trasuj skan"}
      </button>
      {debug && <div className="stage__label">graph: trace={layer.tracePath.join(" → ")}</div>}
    </div>
  )
}
