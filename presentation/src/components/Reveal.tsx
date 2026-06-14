import { CSSProperties, ElementType, ReactNode } from "react"
import { useInView } from "../engine/hooks"
import type { EnterAnim } from "../story/types"

/**
 * Data-driven enter animation. The actual transition lives in CSS
 * (`[data-anim].is-in`), so this component only toggles the `is-in` class
 * and applies the per-layer delay. Under reduced motion the CSS
 * short-circuits straight to the final state.
 */
export function Reveal({
  enter,
  as = "div",
  className = "",
  children,
  style,
}: {
  enter?: EnterAnim
  as?: ElementType
  className?: string
  children: ReactNode
  style?: CSSProperties
}) {
  const { ref, inView } = useInView<HTMLDivElement>()
  const anim = enter?.anim ?? "fade"
  const Tag = as as ElementType
  return (
    <Tag
      ref={ref as never}
      className={`${className} ${inView ? "is-in" : ""}`.trim()}
      data-anim={anim}
      style={{ ...style, transitionDelay: enter?.delay ? `${enter.delay}ms` : undefined }}
    >
      {children}
    </Tag>
  )
}
