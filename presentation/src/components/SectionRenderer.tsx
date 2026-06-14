import { ArchitectureStage } from "./ArchitectureStage"
import { ContentLayer, VisualLayer, VISUAL_KINDS } from "./LayerView"
import type { Layer, Section } from "../story/types"

export function SectionRenderer({
  section,
  reducedMotion,
  debug,
}: {
  section: Section
  reducedMotion: boolean
  debug: boolean
}) {
  // Architecture is a bespoke sticky camera scene.
  if (section.type === "architecture") {
    return <ArchitectureStage section={section} reducedMotion={reducedMotion} debug={debug} />
  }

  const content = section.layers.filter((l) => !VISUAL_KINDS.has(l.kind))
  const visual = section.layers.filter((l) => VISUAL_KINDS.has(l.kind))

  const renderContent = (layers: Layer[]) => layers.map((l) => <ContentLayer key={l.id} layer={l} />)
  const renderVisual = (layers: Layer[]) =>
    layers.map((l) => <VisualLayer key={l.id} layer={l} debug={debug} />)

  let inner: JSX.Element

  if (section.layout === "stage") {
    inner = (
      <div className="stage-section">
        <header className="stage-header">{renderContent(content.filter((l) => l.kind !== "note"))}</header>
        <div className="stage-visual">{renderVisual(visual)}</div>
        {content
          .filter((l) => l.kind === "note")
          .map((l) => <ContentLayer key={l.id} layer={l} />)}
      </div>
    )
  } else if (section.layout === "split-left") {
    inner = (
      <div className="grid-2">
        <div className="stack">{renderContent(content)}</div>
        <div className="stack">{renderVisual(visual)}</div>
      </div>
    )
  } else if (section.layout === "split-right") {
    inner = (
      <div className="grid-2">
        <div className="stack">{renderVisual(visual)}</div>
        <div className="stack">{renderContent(content)}</div>
      </div>
    )
  } else {
    // center
    inner = (
      <div className="stack" style={{ maxWidth: section.type === "hero" || section.type === "pitch" ? "62rem" : undefined }}>
        {renderContent(content)}
        {renderVisual(visual)}
      </div>
    )
  }

  return (
    <section id={section.id} data-section={section.id} className={`section section--${section.bg} type-${section.type}`}>
      <div className="section__inner">{inner}</div>
    </section>
  )
}
