// Send ONE CND_VISION_INFER (synthetic ad banner) straight to the offscreen and
// print the FULL response: did SmolVLM classify it, what description did it emit,
// or did it error? Decides regex-mismatch vs runtime-error.
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXT = join(ROOT, "build", "chrome-mv3-prod")
const BROWSER_EXE =
  process.env.LLM_VERIFY_BROWSER_EXE ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profileDir = await mkdtemp(join(tmpdir(), "cnd-vis-os-"))
let context
try {
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: BROWSER_EXE,
    headless: false,
    viewport: { width: 900, height: 700 },
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`
    ],
    timeout: 60000
  })
  let extId = ""
  for (let i = 0; i < 30 && !extId; i++) {
    const sw =
      context.serviceWorkers().find((s) => s.url().includes("/static/background/")) ||
      context.serviceWorkers()[0]
    if (sw) extId = new URL(sw.url()).host
    else await sleep(1000)
  }
  console.log("EXT ID:", extId)
  const ext = await context.newPage()
  ext.on("console", (m) => console.log("EXTPAGE", m.type(), m.text()))
  await ext.goto(`chrome-extension://${extId}/popup.html`, {
    waitUntil: "domcontentloaded"
  })
  const out = await ext.evaluate(async () => {
    function adUrl() {
      const c = document.createElement("canvas")
      c.width = 728
      c.height = 180
      const x = c.getContext("2d")
      x.fillStyle = "#fff"
      x.fillRect(0, 0, 728, 180)
      x.fillStyle = "#e11d48"
      x.fillRect(12, 12, 704, 80)
      x.fillStyle = "#fff"
      x.font = "bold 52px sans-serif"
      x.fillText("MEGA SALE -50%", 60, 72)
      x.fillStyle = "#1d4ed8"
      x.font = "bold 28px sans-serif"
      x.fillText("Buy now! Shop the limited offer today", 60, 150)
      return c.toDataURL("image/png")
    }
    function plainUrl() {
      const c = document.createElement("canvas")
      c.width = 400
      c.height = 300
      const x = c.getContext("2d")
      const g = x.createLinearGradient(0, 0, 0, 300)
      g.addColorStop(0, "#7ec8ff")
      g.addColorStop(1, "#bfe3a6")
      x.fillStyle = g
      x.fillRect(0, 0, 400, 300)
      x.fillStyle = "#3a7d2c"
      x.beginPath()
      x.arc(120, 230, 70, 0, 7)
      x.fill()
      x.fillStyle = "#ffd24a"
      x.beginPath()
      x.arc(320, 70, 42, 0, 7)
      x.fill()
      return c.toDataURL("image/png")
    }
    try {
      if (!(await chrome.offscreen.hasDocument?.())) {
        await chrome.offscreen.createDocument({
          url: "assets/offscreen/offscreen.html",
          reasons: ["WORKERS"],
          justification: "vision diag"
        })
      }
    } catch (e) {}
    async function classify(image, id) {
      const t0 = performance.now()
      let res
      try {
        res = await chrome.runtime.sendMessage({
          type: "CND_VISION_INFER",
          requestId: id,
          image
        })
      } catch (e) {
        res = { ok: false, error: "sendMessage threw: " + (e?.message || e) }
      }
      return { ms: Math.round(performance.now() - t0), res }
    }
    const ad = await classify(adUrl(), "diag-ad")
    const plain = await classify(plainUrl(), "diag-plain")
    return { ad, plain }
  })
  console.log("RESULT:", JSON.stringify(out, null, 2))
} catch (e) {
  console.log("FAIL:", e?.stack || e?.message || String(e))
} finally {
  if (context) await Promise.race([context.close().catch(() => {}), sleep(8000)])
  await rm(profileDir, { recursive: true, force: true }).catch(() => {})
}
