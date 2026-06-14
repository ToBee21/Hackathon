import { AI_DEEP_DIVE_CATEGORY_LABELS } from "../../shared/aiDeepDive/categories"
import type {
  AiDeepDiveCategory,
  AiDeepDiveRiskResult
} from "../../shared/aiDeepDive/types"

const HOST_ID = "cloak-dagger-ai-deep-dive-alert"
const AUTO_HIDE_MS = 11_000

/**
 * Co systemy śledzące mogą ZROBIĆ z wiedzą, że odwiedziłeś stronę o danym
 * wrażliwym temacie. Świadomie konkretne — to sedno powiadomienia: nie „wykryto
 * ryzyko", lecz wytłumaczenie realnej konsekwencji.
 */
const CATEGORY_CONSEQUENCE: Record<AiDeepDiveCategory, string> = {
  mental_health:
    "Brokerzy danych mogą dopisać Ci etykietę „problemy ze zdrowiem psychicznym” i sprzedać ją reklamodawcom — a w skrajnych przypadkach trafia ona do ubezpieczycieli czy pracodawców.",
  medical:
    "Z tej wizyty można wywnioskować Twój stan zdrowia lub leczenie i dodać taką etykietę do profilu sprzedawanego reklamodawcom i ubezpieczycielom.",
  financial_distress:
    "Sygnał o kłopotach finansowych czyni Cię celem drogich „chwilówek” i reklam żerujących na trudnej sytuacji.",
  legal:
    "Zainteresowanie sprawami prawnymi może trafić do profilu i zostać użyte przy ocenie ryzyka lub do targetowania reklam usług prawnych.",
  politics_extreme:
    "Twoje poglądy polityczne mogą zostać zmapowane i wykorzystane do precyzyjnego targetowania oraz manipulacji.",
  addiction:
    "Etykieta uzależnienia to jeden z najczulszych sygnałów — wykorzystywana do nachalnych, żerujących reklam.",
  identity_life_event:
    "Prywatne wydarzenia (np. ciąża, rozwód, przeprowadzka) to łakomy kąsek dla reklamodawców i zdradzają Twoją sytuację życiową.",
  religion:
    "Twoje przekonania religijne mogą zostać dopisane do profilu i użyte do targetowania lub dyskryminacji."
}

const GENERIC_CONSEQUENCE =
  "Wizyta na takiej stronie może zostać dopisana do Twojego cyfrowego profilu i sprzedana reklamodawcom oraz brokerom danych."

/** Wrażliwa kategoria z najwyższym wynikiem (sterownik treści powiadomienia). */
function topCategory(result: AiDeepDiveRiskResult): AiDeepDiveCategory | null {
  if (!result.categories?.length) return null
  return [...result.categories].sort((a, b) => b.score - a.score)[0].category
}

/**
 * Drobne, dyskretne powiadomienie pojawiające się tylko na stronach o WYSOKIM/
 * KRYTYCZNYM ryzyku profilowania (czerwone w systemie AI). Tłumaczy w prostych
 * słowach, co systemy śledzące mogą zrobić z wiedzą, że tu jesteś — zamiast
 * dawnego dużego okna i toasta „Max Camo".
 */
export function showAiDeepDiveToast(result: AiDeepDiveRiskResult): void {
  if (result.level !== "high" && result.level !== "critical") return

  const existing = document.getElementById(HOST_ID)
  existing?.remove()

  const category = topCategory(result)
  const topic = category ? AI_DEEP_DIVE_CATEGORY_LABELS[category] : null
  const consequence = category
    ? CATEGORY_CONSEQUENCE[category]
    : GENERIC_CONSEQUENCE
  const lead = topic
    ? `Ta strona dotyczy tematu „${topic}".`
    : "Ta strona może ujawniać wrażliwe dane o Tobie."

  const host = document.createElement("div")
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: "closed" })

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 2147483647;
        width: min(320px, calc(100vw - 32px));
        box-sizing: border-box;
        border: 1px solid rgba(255, 92, 119, 0.38);
        border-left: 3px solid #ff4564;
        border-radius: 11px;
        background: rgba(13, 16, 21, 0.96);
        backdrop-filter: blur(6px);
        box-shadow: 0 14px 38px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.04) inset;
        color: #eef1f5;
        font: 12.5px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 12px 36px 12px 13px;
        animation: cnd-in 160ms ease-out;
      }
      @keyframes cnd-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .head { display: flex; gap: 8px; align-items: center; margin-bottom: 5px; }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #ff4564;
        box-shadow: 0 0 12px rgba(255, 69, 100, 0.7);
        flex: 0 0 auto;
      }
      .title {
        margin: 0;
        color: #ffd9df;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .lead { margin: 0 0 4px; font-weight: 600; color: #fbfcfe; }
      .body { margin: 0; color: rgba(238,241,245,0.78); }
      .tip {
        margin: 8px 0 0;
        padding-top: 7px;
        border-top: 1px solid rgba(255,255,255,0.07);
        color: rgba(168, 230, 215, 0.92);
        font-size: 11px;
      }
      button {
        position: absolute;
        top: 8px;
        right: 8px;
        border: 0;
        border-radius: 7px;
        background: rgba(255,255,255,0.07);
        color: rgba(255,255,255,0.7);
        cursor: pointer;
        width: 22px;
        height: 22px;
        line-height: 22px;
        font-size: 14px;
      }
      button:hover { background: rgba(255,255,255,0.13); color: #fff; }
    </style>
    <div class="wrap" role="status" aria-live="polite">
      <button type="button" aria-label="Zamknij powiadomienie">×</button>
      <div class="head">
        <span class="dot"></span>
        <p class="title">Uwaga: ryzyko profilowania</p>
      </div>
      <p class="lead">${escapeHtml(lead)}</p>
      <p class="body">${escapeHtml(consequence)}</p>
      <p class="tip">Wskazówka: rozważ tryb incognito i nie loguj się tu pod głównym kontem.</p>
    </div>
  `

  const remove = () => host.remove()
  const timer = window.setTimeout(remove, AUTO_HIDE_MS)
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
