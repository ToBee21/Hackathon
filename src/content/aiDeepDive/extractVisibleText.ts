import type { AiDeepDiveInput } from "../../shared/aiDeepDive/types"

const MAX_BODY_CHARS = 12_000
const CONTENT_ROOT_SELECTORS = [
  '[itemprop="articleBody"]',
  '[data-testid="article-content"]',
  '[data-test="article-content"]',
  '[data-section="article-content"]',
  '[class*="article-body"]',
  '[class*="articleBody"]',
  '[class*="ArticleBody"]',
  '[class*="article-content"]',
  '[class*="ArticleContent"]',
  "main article",
  "article",
  '[role="main"]',
  "main"
] as const
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

interface TextRootCandidate {
  selector: string
  textLength: number
  paragraphCount: number
  linkTextLength: number
}

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

  return collectVisibleText(findBestTextRoot()).text
}

function findBestTextRoot(): Element {
  const fallbackRoot = document.body
  let best: { root: Element; score: number } | null = null
  const seen = new Set<Element>([fallbackRoot])

  for (const selector of CONTENT_ROOT_SELECTORS) {
    for (const root of Array.from(document.querySelectorAll(selector)).slice(0, 8)) {
      if (seen.has(root)) continue
      seen.add(root)

      const stats = collectVisibleText(root)
      const score = scoreTextRootCandidate({
        selector,
        textLength: stats.text.length,
        paragraphCount: stats.paragraphCount,
        linkTextLength: stats.linkTextLength
      })

      if (!best || score > best.score) {
        best = { root, score }
      }
    }
  }

  return best?.root ?? fallbackRoot
}

function collectVisibleText(root: Element): {
  text: string
  paragraphCount: number
  linkTextLength: number
} {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
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
  let linkTextLength = 0
  let node = walker.nextNode()

  while (node && total < MAX_BODY_CHARS) {
    const text = node.textContent?.replace(/\s+/g, " ").trim()
    if (text) {
      chunks.push(text)
      total += text.length + 1
      if (node.parentElement?.closest("a")) {
        linkTextLength += text.length
      }
    }
    node = walker.nextNode()
  }

  return {
    text: chunks.join("\n").slice(0, MAX_BODY_CHARS),
    paragraphCount: countReadableParagraphs(root),
    linkTextLength
  }
}

export function scoreTextRootCandidate(candidate: TextRootCandidate): number {
  if (candidate.textLength < 80) return 0

  const selector = candidate.selector.toLowerCase()
  const priority =
    selector.includes("articlebody") ||
    selector.includes("article-body") ||
    selector.includes("articlebody") ||
    selector.includes("itemprop")
      ? 3600
      : selector.includes("article-content")
        ? 3000
        : selector.includes("article")
          ? 1200
          : selector.includes("main")
            ? 450
            : 0

  return (
    Math.min(candidate.textLength, MAX_BODY_CHARS) +
    candidate.paragraphCount * 260 +
    priority -
    Math.min(candidate.linkTextLength, 8000) * 0.65
  )
}

function countReadableParagraphs(root: Element): number {
  return Array.from(root.querySelectorAll("p"))
    .filter((paragraph) => !shouldSkipElement(paragraph))
    .filter((paragraph) => (paragraph.textContent?.trim().length ?? 0) >= 40)
    .length
}

function shouldSkipElement(element: Element): boolean {
  if (SKIP_TAGS.has(element.tagName)) return true
  if (
    element.closest(
      "[aria-hidden='true'], [hidden], nav, footer, aside, [role='navigation'], [role='complementary']"
    )
  ) {
    return true
  }
  if (hasNoisyClassName(element)) return true

  const style = window.getComputedStyle(element)
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  )
}

function hasNoisyClassName(element: Element): boolean {
  const value = `${element.className || ""} ${element.id || ""}`.toLowerCase()
  return /\b(ad|ads|advert|advertisement|promo|newsletter|social-share|related)\b/.test(
    value
  )
}
