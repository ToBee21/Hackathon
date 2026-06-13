import type { AiDeepDiveInput } from "../../shared/aiDeepDive/types"

const MAX_BODY_CHARS = 12_000
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "OPTION",
  "BUTTON",
  "SVG",
  "CANVAS",
  "VIDEO",
  "AUDIO"
])

export function extractVisibleTextFromPage(): AiDeepDiveInput {
  return {
    title: document.title || "",
    meta: getMetaDescription(),
    headings: getHeadings(),
    body: getVisibleBodyText(),
    origin: location.origin,
    path: `${location.pathname}${location.search}`
  }
}

function getMetaDescription(): string {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="description"], meta[property="og:description"]'
  )
  return meta?.content ?? ""
}

function getHeadings(): string {
  return Array.from(document.querySelectorAll("h1,h2,h3"))
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .slice(0, 3000)
}

function getVisibleBodyText(): string {
  if (!document.body) return ""

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT
      const text = node.textContent?.replace(/\s+/g, " ").trim()
      if (!text || text.length < 2) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })

  const chunks: string[] = []
  let total = 0
  let node = walker.nextNode()

  while (node && total < MAX_BODY_CHARS) {
    const text = node.textContent?.replace(/\s+/g, " ").trim()
    if (text) {
      chunks.push(text)
      total += text.length + 1
    }
    node = walker.nextNode()
  }

  return chunks.join("\n").slice(0, MAX_BODY_CHARS)
}

function shouldSkipElement(element: Element): boolean {
  if (SKIP_TAGS.has(element.tagName)) return true
  if (element.closest("[aria-hidden='true'], [hidden]")) return true

  const style = window.getComputedStyle(element)
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  )
}

