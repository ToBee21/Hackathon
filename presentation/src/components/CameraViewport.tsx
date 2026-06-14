import { ReactNode, forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { CameraDirector, type TargetResolver } from "../engine/CameraDirector"

export interface CameraHandle {
  director: () => CameraDirector | null
  setResolver: (fn: TargetResolver) => void
  setLabel: (text: string) => void
}

/**
 * CameraViewport — the clipping frame + transformable content layer.
 * Owns one CameraDirector. The visual (children) is mounted inside the
 * transformed content. The parent scene drives the camera via the handle.
 */
export const CameraViewport = forwardRef<
  CameraHandle,
  { children: ReactNode; reducedMotion?: boolean; label?: string; debug?: boolean }
>(function CameraViewport({ children, reducedMotion, label }, ref) {
  const vpRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const dirRef = useRef<CameraDirector | null>(null)
  const resolverRef = useRef<TargetResolver>(() => null)

  useEffect(() => {
    if (!vpRef.current || !contentRef.current) return
    const dir = new CameraDirector(
      vpRef.current,
      contentRef.current,
      (id) => resolverRef.current(id),
      { reducedMotion },
    )
    dirRef.current = dir
    return () => {
      dir.dispose()
      dirRef.current = null
    }
  }, [reducedMotion])

  useImperativeHandle(
    ref,
    () => ({
      director: () => dirRef.current,
      setResolver: (fn) => {
        resolverRef.current = fn
      },
      setLabel: (text) => {
        if (labelRef.current) labelRef.current.textContent = text
      },
    }),
    [],
  )

  return (
    <div className="stage">
      <div className="stage__viewport" ref={vpRef}>
        <div className="stage__content" ref={contentRef}>
          {children}
        </div>
      </div>
      <div className="stage__scrim" />
      <div className="stage__label" ref={labelRef}>
        {label}
      </div>
    </div>
  )
})
