import type { AiDeepDiveRiskResult } from "../../shared/aiDeepDive/types"

const HOST_ID = "cloak-dagger-ai-deep-dive-alert"

export function showAiDeepDiveToast(result: AiDeepDiveRiskResult): void {
  if (result.level !== "high" && result.level !== "critical") return

  const existing = document.getElementById(HOST_ID)
  existing?.remove()

  const host = document.createElement("div")
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: "closed" })
  const severity = result.level === "critical" ? "krytyczne" : "wysokie"

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 2147483647;
        width: min(230px, calc(100vw - 28px));
        box-sizing: border-box;
        border: 1px solid rgba(255, 92, 119, 0.42);
        border-radius: 10px;
        background: rgba(14, 17, 22, 0.94);
        box-shadow: 0 12px 34px rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.05) inset;
        color: #fff5f6;
        font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 9px 34px 9px 10px;
        animation: cnd-in 120ms ease-out;
      }
      @keyframes cnd-in {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .top { display: flex; gap: 8px; align-items: center; }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #ff4564;
        box-shadow: 0 0 14px rgba(255, 69, 100, 0.75);
        flex: 0 0 auto;
      }
      .title {
        margin: 0;
        color: #E6EDF3;
        font-weight: 750;
        letter-spacing: 0;
        font-size: 12px;
      }
      .meta {
        margin: 2px 0 0;
        color: rgba(255,245,246,0.62);
        font-size: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      button {
        position: absolute;
        top: 6px;
        right: 6px;
        border: 0;
        border-radius: 7px;
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.78);
        cursor: pointer;
        width: 22px;
        height: 22px;
        line-height: 22px;
        font-size: 14px;
      }
    </style>
    <div class="wrap" role="status" aria-live="polite">
      <button type="button" aria-label="Zamknij alert">×</button>
      <div class="top">
        <span class="dot"></span>
        <div>
          <p class="title">Max Camo aktywny</p>
          <p class="meta">Ryzyko: ${escapeHtml(severity)}</p>
        </div>
      </div>
    </div>
  `

  const remove = () => host.remove()
  const timer = window.setTimeout(remove, 6500)
  shadow.querySelector("button")?.addEventListener("click", () => {
    window.clearTimeout(timer)
    remove()
  })
  document.documentElement.appendChild(host)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })
}

