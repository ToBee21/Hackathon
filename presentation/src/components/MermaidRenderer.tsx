import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"

export interface MermaidApi {
  root: SVGSVGElement | null
  getNode: (logicalId: string) => Element | null
  highlight: (logicalId: string | null) => void
  setStepMode: (on: boolean) => void
}

let initialized = false
let renderSeq = 0

function initMermaid() {
  if (initialized) return
  initialized = true
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "base",
    fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
    themeVariables: {
      background: "#07080a",
      primaryColor: "#12151b",
      primaryBorderColor: "#333a46",
      primaryTextColor: "#f3f1ea",
      secondaryColor: "#0c0e12",
      tertiaryColor: "#0c0e12",
      lineColor: "#5a616b",
      fontSize: "15px",
      clusterBkg: "#0c0e12",
      clusterBorder: "#232831",
    },
    flowchart: { htmlLabels: true, curve: "basis", nodeSpacing: 46, rankSpacing: 70 },
  })
}

/**
 * Recover the logical node id from mermaid's generated DOM id.
 * v11 emits ids like "<renderId>-flowchart-<logicalId>-<n>", e.g.
 * "cd-mermaid-0-flowchart-offscreen-3" → "offscreen".
 */
function logicalIdOf(domId: string): string {
  const m = domId.match(/flowchart-(.+)-\d+$/)
  if (m) return m[1]
  return domId.replace(/^flowchart-/, "").replace(/-\d+$/, "")
}

export function MermaidRenderer({
  source,
  onReady,
  className = "",
}: {
  source: string
  onReady?: (api: MermaidApi) => void
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initMermaid()
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    const id = `cd-mermaid-${renderSeq++}`
    mermaid
      .render(id, source)
      .then(({ svg }) => {
        if (cancelled || !host) return
        host.innerHTML = svg
        const root = host.querySelector("svg") as SVGSVGElement | null
        if (root) {
          root.removeAttribute("width")
          root.removeAttribute("height")
          root.style.width = "100%"
          root.style.height = "100%"
        }
        // tag every node with its logical id for camera targeting
        host.querySelectorAll<SVGGElement>("g.node").forEach((g) => {
          if (g.id) g.setAttribute("data-cam-id", logicalIdOf(g.id))
        })
        host.querySelectorAll<SVGGElement>("g.edgePaths > path, g.edgePath").forEach(() => {})

        const api: MermaidApi = {
          root,
          getNode: (lid) => host.querySelector(`[data-cam-id="${lid}"]`),
          highlight: (lid) => {
            host.querySelectorAll(".cam-active").forEach((n) => n.classList.remove("cam-active"))
            if (lid) {
              const el = host.querySelector(`[data-cam-id="${lid}"]`)
              el?.classList.add("cam-active")
            }
          },
          setStepMode: (on) => host.classList.toggle("step-mode", on),
        }
        setError(null)
        onReady?.(api)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  if (error) {
    return <pre className="mermaid-error">Błąd diagramu Mermaid:\n{error}</pre>
  }
  return <div className={`mermaid-host ${className}`.trim()} ref={hostRef} />
}
