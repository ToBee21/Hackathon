// src/content/adOverlayZapper.ts
// Fast local ad-overlay zapper for hostile streaming/popunder pages. This is not
// a secrecy boundary and does not inspect form values; it only removes obvious
// page DOM overlays that cover the viewport and look like aggressive ads.

const ZAPPED_ATTR = "data-cnd-ad-overlay-zapped"
const MAX_ZAPS_PER_PAGE = 12
const SCAN_INTERVAL_MS = 900
const SCAN_LIMIT_MS = 30_000

const AD_WORDS = [
  "adult",
  "amber",
  "linda",
  "karen",
  "dating",
  "lingerie",
  "cam",
  "girls",
  "casino",
  "bonus",
  "download",
  "install",
  "android app"
]

let installed = false
let zapped = 0
let stopTimer: ReturnType<typeof setTimeout> | null = null
let scanTimer: ReturnType<typeof setInterval> | null = null

export function initAdOverlayZapper(): void {
  if (installed || typeof document === "undefined") return
  installed = true

  const scan = () => zapAdOverlays()
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true })
  } else {
    scan()
  }

  scanTimer = setInterval(scan, SCAN_INTERVAL_MS)
  stopTimer = setTimeout(() => {
    if (scanTimer) clearInterval(scanTimer)
    scanTimer = null
  }, SCAN_LIMIT_MS)

  const observer = new MutationObserver(() => scan())
  observer.observe(document.documentElement, { childList: true, subtree: true })
  setTimeout(() => observer.disconnect(), SCAN_LIMIT_MS)
}

export function zapAdOverlays(): number {
  if (zapped >= MAX_ZAPS_PER_PAGE) return 0
  const candidates = Array.from(document.body?.querySelectorAll<HTMLElement>("body *") ?? [])
    .filter(isLikelyAdOverlay)
    .slice(0, MAX_ZAPS_PER_PAGE - zapped)

  for (const el of candidates) {
    el.setAttribute(ZAPPED_ATTR, "1")
    el.style.setProperty("display", "none", "important")
    el.style.setProperty("visibility", "hidden", "important")
    el.style.setProperty("pointer-events", "none", "important")
    zapped += 1
  }
  return candidates.length
}

function isLikelyAdOverlay(el: HTMLElement): boolean {
  if (el.hasAttribute(ZAPPED_ATTR)) return false
  if (el.closest("[data-cloak-dagger]")) return false
  if (isSensitiveUi(el)) return false

  const rect = el.getBoundingClientRect()
  if (rect.width < 300 || rect.height < 220) return false
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight)
  const area = rect.width * rect.height
  if (area < viewportArea * 0.12) return false
  if (!coversViewportCenter(rect)) return false

  const style = getComputedStyle(el)
  const pos = style.position
  const z = Number.parseInt(style.zIndex || "0", 10)
  if (pos !== "fixed" && pos !== "absolute" && z < 100) return false
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) {
    return false
  }

  const text = (el.innerText || el.textContent || "").toLowerCase()
  const html = el.innerHTML.toLowerCase()
  const imgCount = el.querySelectorAll("img, picture, video, iframe").length
  const closeButton = hasCloseControl(el)
  const playLike = el.querySelectorAll("button, [role='button'], a").length >= 3
  const adText = AD_WORDS.some((word) => text.includes(word) || html.includes(word))

  return closeButton && (adText || imgCount >= 2 || playLike)
}

function coversViewportCenter(rect: DOMRect): boolean {
  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2
  return rect.left <= cx && rect.right >= cx && rect.top <= cy && rect.bottom >= cy
}

function hasCloseControl(el: HTMLElement): boolean {
  const controls = Array.from(
    el.querySelectorAll<HTMLElement>("button,a,[role='button'],[aria-label],.close,.modal-close")
  )
  return controls.some((node) => {
    const label = `${node.getAttribute("aria-label") ?? ""} ${node.getAttribute("title") ?? ""} ${node.textContent ?? ""}`.toLowerCase()
    return /(^|\s|×|x|close|zamknij|dismiss)/i.test(label)
  })
}

function isSensitiveUi(el: HTMLElement): boolean {
  const text = (el.innerText || el.textContent || "").toLowerCase()
  if (el.querySelector("input, textarea, select")) return true
  return /sign in|log in|login|password|hasło|cookie|consent|privacy|terms|2fa|verification/.test(text)
}

export function resetAdOverlayZapperForTest(): void {
  installed = false
  zapped = 0
  if (scanTimer) clearInterval(scanTimer)
  if (stopTimer) clearTimeout(stopTimer)
  scanTimer = null
  stopTimer = null
}
