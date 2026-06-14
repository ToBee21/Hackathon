// src/content/dataFootprintScan.ts
// Warstwa content „Data Footprint": zbiera METADANE pól formularzy bieżącej
// strony (type / name / id / autocomplete / placeholder / etykieta) — NIGDY
// wartości — i zapisuje podsumowanie do dataFootprintState. Zero sieci.
// Re-skan po zmianach DOM (debounce), wzorowane na warstwach linkGuard/mailGuard.

import {
  summarizeFields,
  type FormFieldMeta
} from "../shared/dataFootprint/piiFieldHeuristics"
import { setDataFootprint } from "../shared/dataFootprint/dataFootprintState"

const MAX_FIELDS = 80

// Typy pól, które nie zbierają danych osobowych — pomijamy.
const SKIP_TYPES = new Set([
  "hidden",
  "submit",
  "button",
  "reset",
  "image",
  "file",
  "checkbox",
  "radio",
  "range",
  "color"
])

export function initDataFootprint(): void {
  if (typeof document === "undefined") return
  if (window.top !== window) return // tylko ramka główna

  const run = () => {
    try {
      setDataFootprint(summarizeFields(collectFieldMeta()))
    } catch {
      // Skan nie może nigdy wywrócić strony.
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true })
  } else {
    run()
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      run()
    }, 1200)
  }

  const start = () => {
    if (!document.body) return
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true
    })
  }
  if (document.body) start()
  else document.addEventListener("DOMContentLoaded", start, { once: true })
}

/** Reads field METADATA only — never touches `.value`. Exported for tests. */
export function collectFieldMeta(doc: Document = document): FormFieldMeta[] {
  const out: FormFieldMeta[] = []
  const nodes = doc.querySelectorAll<HTMLElement>("input, select, textarea")

  for (const el of Array.from(nodes)) {
    if (out.length >= MAX_FIELDS) break
    const type = (el.getAttribute("type") || el.tagName).toLowerCase()
    if (SKIP_TYPES.has(type)) continue
    out.push({
      type,
      name: (el.getAttribute("name") || "").toLowerCase(),
      id: (el.getAttribute("id") || "").toLowerCase(),
      autocomplete: (el.getAttribute("autocomplete") || "").toLowerCase(),
      placeholder: (el.getAttribute("placeholder") || "").toLowerCase(),
      label: labelTextFor(el, doc).toLowerCase()
    })
  }
  return out
}

function labelTextFor(el: Element, doc: Document): string {
  const aria = el.getAttribute("aria-label")
  if (aria) return aria.slice(0, 120)

  const id = el.getAttribute("id")
  if (id) {
    try {
      const lbl = doc.querySelector(`label[for="${id.replace(/["\\]/g, "\\$&")}"]`)
      if (lbl?.textContent) return lbl.textContent.trim().slice(0, 120)
    } catch {
      // Malformed id → ignore selector errors.
    }
  }

  const parentLabel = el.closest("label")
  if (parentLabel?.textContent) return parentLabel.textContent.trim().slice(0, 120)
  return ""
}
