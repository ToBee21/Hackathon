// ============================================================
// deck.story.json — schema (TypeScript types + runtime validation)
// The renderer is 100% data-driven: no content lives in components.
// Every visual element is addressable by a stable `id`.
// ============================================================

export type AnimName =
  | "fade"
  | "slide"
  | "slideLeft"
  | "scale"
  | "blurIn"
  | "none"

export interface EnterAnim {
  anim: AnimName
  /** ms delay after the layer scrolls into view */
  delay?: number
}

export type LayerKind =
  | "eyebrow"
  | "display"
  | "heading"
  | "subhead"
  | "lead"
  | "body"
  | "list"
  | "kpis"
  | "features"
  | "callout"
  | "code"
  | "mermaid"
  | "graph"
  | "chart"
  | "note"

export interface BaseLayer {
  id: string
  kind: LayerKind
  enter?: EnterAnim
  /** ARIA label for non-text visuals (diagrams/charts/graphs) */
  a11y?: string
}

export interface TextLayer extends BaseLayer {
  kind: "eyebrow" | "display" | "heading" | "subhead" | "lead" | "body" | "note" | "callout"
  text: string
}

export interface ListLayer extends BaseLayer {
  kind: "list"
  items: string[]
}

export interface KpiItem {
  value: string
  unit?: string
  label: string
  evidence?: string
}
export interface KpiLayer extends BaseLayer {
  kind: "kpis"
  items: KpiItem[]
}

export interface FeatureItem {
  id: string
  name: string
  oneLiner: string
  files?: string
}
export interface FeatureLayer extends BaseLayer {
  kind: "features"
  items: FeatureItem[]
}

export interface CodeLayer extends BaseLayer {
  kind: "code"
  filename: string
  lines: string[]
  /** indices (0-based) highlighted as the section is read */
  activeLines?: number[]
}

export interface MermaidLayer extends BaseLayer {
  kind: "mermaid"
  source: string
}

export interface GraphNode {
  id: string
  label: string
  kind: "content" | "background" | "offscreen" | "panel" | "popup" | "model" | "security"
  x: number
  y: number
}
export interface GraphEdge {
  from: string
  to: string
  label?: string
}
export interface GraphLayer extends BaseLayer {
  kind: "graph"
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** ordered node ids that the "trace request" animation walks through */
  tracePath: string[]
}

export interface ChartSeriesPoint {
  name: string
  value: number
  unit?: string
}
export interface ChartLayer extends BaseLayer {
  kind: "chart"
  title: string
  question: string
  source?: string
  /** chart kind kept small + honest */
  variant: "bars"
  series: ChartSeriesPoint[]
  /** lower value is better? affects annotation phrasing */
  lowerIsBetter?: boolean
  annotation?: string
}

export type Layer =
  | TextLayer
  | ListLayer
  | KpiLayer
  | FeatureLayer
  | CodeLayer
  | MermaidLayer
  | GraphLayer
  | ChartLayer

// ---- camera ----------------------------------------------------------------

export type CameraShot =
  | "wide"
  | "medium"
  | "closeup"
  | "diagramFocus"

export interface CameraKeyframe {
  id: string
  /** dom/svg element id (within the stage) to center on; omit = wide reset */
  targetId?: string
  shot: CameraShot
  /** zoom multiplier (1 = fit). Overridden by fit-to-element when targetId set. */
  zoom: number
  /** scroll-progress fraction [0..1] at which this keyframe is reached */
  at: number
  easing?: string
  /** caption shown in the stage corner while this keyframe is active */
  label?: string
}

export type SectionType =
  | "hero"
  | "problem"
  | "architecture"
  | "data"
  | "graph"
  | "code"
  | "features"
  | "pitch"

export type SectionLayout =
  | "center"
  | "split-left" // text left, visual right
  | "split-right" // visual left, text right
  | "stage" // full-bleed cinematic stage (pinned camera)
  | "full"

export interface Section {
  id: string
  title: string
  type: SectionType
  bg: "bg0" | "bg1" | "bg2"
  layout: SectionLayout
  durationHint?: number
  /** scroll-scrubbed camera keyframes; only used by `stage`/`architecture` */
  camera?: CameraKeyframe[]
  /** which layer id holds the camera stage target (mermaid/graph) */
  stageLayerId?: string
  layers: Layer[]
  narration?: string
  presenterNotes?: string
  interactions?: string[]
}

export interface ThemeTokens {
  accent: string
  bg: string
  ink: string
}

export interface DeckMeta {
  id: string
  title: string
  subtitle: string
  author: string
  language: string
  scrollSnap: boolean
}

export interface DeckStory {
  meta: DeckMeta
  theme: ThemeTokens
  sections: Section[]
}

// ---- runtime validation ----------------------------------------------------

export interface ValidationIssue {
  path: string
  message: string
}

/**
 * Validation rules (kept pragmatic):
 *  - every section + layer has a non-empty id
 *  - ids are unique within their scope
 *  - camera keyframes are sorted ascending by `at` in [0..1]
 *  - camera targetIds, when set, must resolve (graph node id or mermaid node)
 *  - stage sections must declare stageLayerId pointing to a mermaid/graph layer
 */
export function validateDeck(deck: DeckStory): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const sectionIds = new Set<string>()

  deck.sections.forEach((s, si) => {
    const sp = `sections[${si}]`
    if (!s.id) issues.push({ path: sp, message: "section missing id" })
    if (sectionIds.has(s.id)) issues.push({ path: sp, message: `duplicate section id "${s.id}"` })
    sectionIds.add(s.id)

    const layerIds = new Set<string>()
    s.layers.forEach((l, li) => {
      const lp = `${sp}.layers[${li}]`
      if (!l.id) issues.push({ path: lp, message: "layer missing id" })
      if (layerIds.has(l.id)) issues.push({ path: lp, message: `duplicate layer id "${l.id}"` })
      layerIds.add(l.id)
    })

    if (s.layout === "stage" || s.type === "architecture") {
      if (!s.stageLayerId) {
        issues.push({ path: sp, message: "stage section missing stageLayerId" })
      } else if (!layerIds.has(s.stageLayerId)) {
        issues.push({ path: sp, message: `stageLayerId "${s.stageLayerId}" not found in layers` })
      }
    }

    if (s.camera) {
      let prev = -1
      s.camera.forEach((k, ki) => {
        const kp = `${sp}.camera[${ki}]`
        if (k.at < 0 || k.at > 1) issues.push({ path: kp, message: `at=${k.at} out of [0..1]` })
        if (k.at < prev) issues.push({ path: kp, message: "camera keyframes not sorted ascending by `at`" })
        prev = k.at
      })
    }
  })

  return issues
}
