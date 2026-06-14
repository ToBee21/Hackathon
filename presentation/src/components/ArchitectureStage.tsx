import { useEffect, useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { CameraViewport, type CameraHandle } from "./CameraViewport"
import { MermaidRenderer, type MermaidApi } from "./MermaidRenderer"
import { Reveal } from "./Reveal"
import type { MermaidLayer, Section, TextLayer } from "../story/types"
import type { Shot } from "../engine/CameraDirector"
import { debugState } from "../engine/debugStore"

gsap.registerPlugin(ScrollTrigger)

interface PrecomputedShot {
  at: number
  shot: Shot
  targetId?: string
  label?: string
}

const HEADER_KINDS = new Set(["eyebrow", "display", "heading", "subhead", "lead", "body"])

/**
 * Architecture scene: a sticky, full-height stage holding a Mermaid diagram,
 * with a scroll-scrubbed camera that flies through the runtime boundaries.
 * Under reduced motion the section collapses to a single static wide shot.
 */
export function ArchitectureStage({
  section,
  reducedMotion,
  debug,
}: {
  section: Section
  reducedMotion: boolean
  debug: boolean
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const camRef = useRef<CameraHandle>(null)
  const apiRef = useRef<MermaidApi | null>(null)
  const shotsRef = useRef<PrecomputedShot[]>([])
  const lastTargetRef = useRef<string | null>(null)

  const mermaidLayer = section.layers.find((l) => l.id === section.stageLayerId) as MermaidLayer
  const header = section.layers.filter((l) => HEADER_KINDS.has(l.kind)) as TextLayer[]
  const note = section.layers.find((l) => l.kind === "note") as TextLayer | undefined
  const keyframes = section.camera ?? []

  function computeShots() {
    const dir = camRef.current?.director()
    if (!dir) return
    shotsRef.current = keyframes.map((k) => ({
      at: k.at,
      targetId: k.targetId,
      label: k.label,
      shot: dir.shotForTarget(k.targetId, k.zoom),
    }))
  }

  const handleReady = (api: MermaidApi) => {
    apiRef.current = api
    const cam = camRef.current
    if (!cam) return
    cam.setResolver((id) => (id === "__root__" ? api.root : api.getNode(id)))
    const dir = cam.director()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        computeShots()
        if (dir && shotsRef.current[0]) dir.jumpTo(shotsRef.current[0].shot, "—", shotsRef.current[0].label ?? "wide")
        ScrollTrigger.refresh()
      })
    })
  }

  useEffect(() => {
    if (reducedMotion) return
    const trigger = sectionRef.current
    if (!trigger) return
    const st = ScrollTrigger.create({
      trigger,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onRefresh: computeShots,
      onUpdate: (self) => {
        const dir = camRef.current?.director()
        if (!dir || shotsRef.current.length === 0) return
        dir.scrubTo(self.progress, shotsRef.current)
        debugState.z = dir.debug.z
        debugState.tx = dir.debug.tx
        debugState.ty = dir.debug.ty
        debugState.targetId = dir.debug.targetId
        debugState.keyframe = dir.debug.keyframe
        const t = dir.debug.targetId
        if (t !== lastTargetRef.current) {
          lastTargetRef.current = t
          apiRef.current?.highlight(t === "—" ? null : t)
          camRef.current?.setLabel(dir.debug.keyframe)
        }
      },
    })
    return () => st.kill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion])

  return (
    <section
      ref={sectionRef}
      id={section.id}
      data-section={section.id}
      className={`arch-section section--${section.bg} ${reducedMotion ? "is-static" : ""}`}
    >
      <div className="arch-sticky">
        <header className="stage-header">
          {header.map((l) => (
            <Reveal key={l.id} enter={l.enter} className={headerClass(l)}>
              {renderHeaderText(l)}
            </Reveal>
          ))}
        </header>

        <CameraViewport ref={camRef} reducedMotion={reducedMotion} label={keyframes[0]?.label} debug={debug}>
          <MermaidRenderer source={mermaidLayer.source} onReady={handleReady} />
        </CameraViewport>

        {note && <p className="stage-caption">{note.text}</p>}
      </div>
    </section>
  )
}

function headerClass(l: TextLayer) {
  if (l.kind === "eyebrow") return "eyebrow"
  if (l.kind === "display") return "display"
  if (l.kind === "heading") return "headline"
  if (l.kind === "subhead") return "subhead"
  if (l.kind === "lead") return "lead"
  return "body"
}
function renderHeaderText(l: TextLayer) {
  return l.text.split("\n").map((line, i) => (
    <span key={i} style={{ display: "block" }}>
      {line}
    </span>
  ))
}
