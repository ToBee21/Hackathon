import { AI_DEEP_DIVE_CATEGORY_LABELS } from "../../shared/aiDeepDive/categories"
import type { AiDeepDiveRiskResult } from "../../shared/aiDeepDive/types"

const HOST_ID = "cloak-dagger-ai-deep-dive-alert"

export function showAiDeepDiveToast(result: AiDeepDiveRiskResult): void {
  if (result.level !== "high" && result.level !== "critical") return

  const existing = document.getElementById(HOST_ID)
  existing?.remove()

  const host = document.createElement("div")
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: "closed" })
  const categories = result.categories
    .slice(0, 2)
    .map((entry) => AI_DEEP_DIVE_CATEGORY_LABELS[entry.category])
    .join(", ")

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 36px));
        box-sizing: border-box;
        border: 1px solid rgba(255, 85, 105, 0.55);
        border-radius: 12px;
        background: rgba(20, 8, 12, 0.96);
        box-shadow: 0 18px 48px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.06) inset;
        color: #fff5f6;
        font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 14px;
      }
      .top { display: flex; gap: 10px; align-items: flex-start; }
      .dot {
        width: 10px;
        height: 10px;
        margin-top: 5px;
        border-radius: 999px;
        background: #ff4564;
        box-shadow: 0 0 18px rgba(255, 69, 100, 0.9);
        flex: 0 0 auto;
      }
      .title {
        margin: 0;
        color: #ff8ea0;
        font-weight: 750;
        letter-spacing: 0;
        font-size: 13px;
      }
      .body { margin: 4px 0 0; color: rgba(255,245,246,0.86); }
      .meta { margin: 8px 0 0; color: rgba(255,245,246,0.62); font-size: 11px; }
      button {
        position: absolute;
        top: 8px;
        right: 8px;
        border: 0;
        border-radius: 8px;
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.78);
        cursor: pointer;
        width: 26px;
        height: 26px;
        line-height: 26px;
        font-size: 16px;
      }
    </style>
    <div class="wrap" role="status" aria-live="polite">
      <button type="button" aria-label="Zamknij alert">×</button>
      <div class="top">
        <span class="dot"></span>
        <div>
          <p class="title">AI Deep-Dive Risk: ${escapeHtml(result.level)}</p>
          <p class="body">
            Ta treść jest wysoko profilowalna przez AI/trackerów.
            ${categories ? `Wrażliwe sygnały: <strong>${escapeHtml(categories)}</strong>.` : ""}
          </p>
          <p class="meta">Aktywowano maksymalny kamuflaż behawioralny.</p>
        </div>
      </div>
    </div>
  `

  shadow.querySelector("button")?.addEventListener("click", () => host.remove())
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

