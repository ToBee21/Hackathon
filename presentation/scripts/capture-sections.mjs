// Capture per-section screenshots from the built deck as proof.
// Usage: node scripts/capture-sections.mjs   (expects `vite preview` on :4317)
import { chromium } from "@playwright/test"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdirSync, readFileSync } from "node:fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const BASE = process.env.BASE_URL || "http://localhost:4317"
const OUT = join(ROOT, "shots")
mkdirSync(OUT, { recursive: true })

const deck = JSON.parse(readFileSync(join(ROOT, "src/story/deck.story.json"), "utf8"))
const sections = deck.sections

async function scrollToY(page, y) {
  await page.evaluate((yy) => {
    document.documentElement.style.scrollBehavior = "auto"
    window.scrollTo(0, yy)
  }, y)
}
async function scrollToSection(page, id, frac = 0) {
  await page.evaluate(
    ({ id, frac }) => {
      document.documentElement.style.scrollBehavior = "auto"
      const el = document.getElementById(id)
      if (!el) return
      const rect = el.getBoundingClientRect()
      const top = rect.top + window.scrollY
      const extra = Math.max(0, el.offsetHeight - window.innerHeight) * frac
      window.scrollTo(0, top + extra)
    },
    { id, frac },
  )
}

async function run() {
  const browser = await chromium.launch()
  const results = []

  for (const reduced of [false, true]) {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 2,
      reducedMotion: reduced ? "reduce" : "no-preference",
    })
    const page = await ctx.newPage()
    const url = reduced ? `${BASE}/?reduced=1` : `${BASE}/?debug=1`
    await page.goto(url, { waitUntil: "networkidle" })
    await page.waitForTimeout(800)
    const tag = reduced ? "reduced" : "full"

    for (const s of sections) {
      try {
        await scrollToSection(page, s.id, 0)
        // wait for heavy visuals
        if (s.type === "architecture") {
          await page.waitForSelector(".mermaid-host svg", { timeout: 8000 }).catch(() => {})
        }
        if (s.type === "graph") {
          await page.waitForSelector(".react-flow__node", { timeout: 8000 }).catch(() => {})
        }
        await page.waitForTimeout(s.type === "graph" ? 2600 : 1500)
        const file = join(OUT, `${tag}-${s.id}.png`)
        await page.screenshot({ path: file })
        results.push(file)

        // bonus cinematic close-up mid-way through the architecture camera
        if (s.type === "architecture" && !reduced) {
          await scrollToSection(page, s.id, 0.6)
          await page.waitForTimeout(1400)
          const f2 = join(OUT, `${tag}-${s.id}-closeup.png`)
          await page.screenshot({ path: f2 })
          results.push(f2)
        }
      } catch (e) {
        console.error(`! ${s.id} (${tag}):`, e.message)
      }
    }
    await ctx.close()
  }

  await browser.close()
  console.log(`captured ${results.length} screenshots into ${OUT}`)
  results.forEach((r) => console.log("  -", r.replace(ROOT, ".")))
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
