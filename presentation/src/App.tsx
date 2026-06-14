import { useEffect, useMemo, useRef, useState } from "react"
import deckJson from "./story/deck.story.json"
import { type DeckStory, validateDeck } from "./story/types"
import { SectionRenderer } from "./components/SectionRenderer"
import { DebugOverlay } from "./components/DebugOverlay"
import { useQueryFlag, useReducedMotion } from "./engine/hooks"
import { debugState } from "./engine/debugStore"

const deck = deckJson as unknown as DeckStory

export default function App() {
  const osReduced = useReducedMotion()
  const forcedReduced = useQueryFlag("reduced")
  const reduced = osReduced || forcedReduced
  const debug = useQueryFlag("debug")

  const [activeIdx, setActiveIdx] = useState(0)
  const progressRef = useRef<HTMLDivElement>(null)

  // validate the storyboard once; surface issues in console + debug HUD
  const issues = useMemo(() => validateDeck(deck), [])
  useEffect(() => {
    debugState.reduced = reduced
    debugState.issues = issues.length
    document.title = `${deck.meta.title} — ${deck.meta.subtitle}`
    if (issues.length) console.warn("[deck.story.json] validation issues:", issues)
    else console.info("[deck.story.json] valid:", deck.sections.length, "sekcji")
  }, [issues, reduced])

  // scroll progress bar
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const max = document.documentElement.scrollHeight - window.innerHeight
        const p = max > 0 ? window.scrollY / max : 0
        debugState.progress = p
        if (progressRef.current) progressRef.current.style.width = `${(p * 100).toFixed(2)}%`
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // active section tracking
  useEffect(() => {
    const ratios = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => ratios.set((e.target as HTMLElement).dataset.section!, e.intersectionRatio))
        let best = -1
        let bestId = deck.sections[0].id
        ratios.forEach((r, id) => {
          if (r > best) {
            best = r
            bestId = id
          }
        })
        const idx = deck.sections.findIndex((s) => s.id === bestId)
        if (idx >= 0) {
          setActiveIdx(idx)
          debugState.section = bestId
        }
      },
      { threshold: [0.1, 0.25, 0.5, 0.75] },
    )
    document.querySelectorAll("[data-section]").forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })
  }

  return (
    <div className={`deck ${reduced ? "reduced" : ""}`}>
      <div className="deck-grain" aria-hidden />
      <div className="deck-vignette" aria-hidden />
      <div className="progress-bar" ref={progressRef} />

      <div className="topbar">
        <span className="brand">
          <b>■</b> {deck.meta.title}
        </span>
        <span>
          {String(activeIdx + 1).padStart(2, "0")} / {String(deck.sections.length).padStart(2, "0")} ·{" "}
          {deck.sections[activeIdx]?.title}
        </span>
      </div>

      <nav className="rail" aria-label="Nawigacja sekcji">
        {deck.sections.map((s, i) => (
          <button
            key={s.id}
            className={`rail__dot ${i === activeIdx ? "is-active" : ""}`}
            title={s.title}
            aria-label={s.title}
            aria-current={i === activeIdx}
            onClick={() => goTo(s.id)}
          />
        ))}
      </nav>

      <main>
        {deck.sections.map((s) => (
          <SectionRenderer key={s.id} section={s} reducedMotion={reduced} debug={debug} />
        ))}
      </main>

      {debug && <DebugOverlay />}
    </div>
  )
}
