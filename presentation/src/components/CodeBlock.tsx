import { Fragment, ReactNode } from "react"
import type { CodeLayer } from "../story/types"

const TOKEN = /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(const|function|return|export|if|else|as|true|false|typeof|new|void|of|in)\b|([A-Za-z_]\w*)(?=\()/g

function tokenize(line: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  TOKEN.lastIndex = 0
  let k = 0
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index))
    if (m[1]) out.push(<span key={k++} className="tok-com">{m[1]}</span>)
    else if (m[2]) out.push(<span key={k++} className="tok-str">{m[2]}</span>)
    else if (m[3]) out.push(<span key={k++} className="tok-key">{m[3]}</span>)
    else if (m[4]) out.push(<span key={k++} className="tok-fn">{m[4]}</span>)
    last = m.index + m[0].length
  }
  if (last < line.length) out.push(line.slice(last))
  return out
}

export function CodeBlock({ layer }: { layer: CodeLayer }) {
  const active = new Set(layer.activeLines ?? [])
  return (
    <div className="code" aria-label={layer.a11y}>
      <div className="code__bar">
        <span className="code__dot" />
        <span className="code__dot" />
        <span className="code__dot" />
        <span style={{ marginLeft: "auto" }}>{layer.filename}</span>
      </div>
      <pre>
        <code>
          {layer.lines.map((line, i) => (
            <span key={i} className={`ln ${active.has(i) ? "is-active" : ""}`}>
              {line.length ? tokenize(line) : <Fragment>{" "}</Fragment>}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}
