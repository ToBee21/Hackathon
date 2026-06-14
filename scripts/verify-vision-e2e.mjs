// End-to-end proof of the AI Vision ad-image blocker in the BUILT extension:
// a real page with two same-origin images (a synthetic ad banner + a neutral
// scene) -> trigger a scan -> the content script harvests them -> the REAL
// offscreen SmolVLM handler classifies each -> the ad image gets blurred+badged.
// No stub classifier: this exercises content -> offscreen -> back -> blur.

import { createRequire } from "node:module"
import { createServer } from "node:http"
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
const TIMEOUT_MS = Number(process.env.VISION_E2E_TIMEOUT_MS || 180000)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Fixture: draw two same-origin (canvas->dataURL) images so canvas rasterisation
// in the content script is never tainted. #ad = a SALE banner; #plain = a plain
// landscape-ish scene with no commerce cues.
const PAGE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>Vision E2E Fixture</title></head><body style="margin:0;padding:24px;background:#fff">
<h1>Vision ad-blocker fixture</h1>
<img id="ad" alt="ad"/><br/><br/><img id="plain" alt="plain"/>
<script>
function adBannerUrl(){const c=document.createElement('canvas');c.width=728;c.height=180;const x=c.getContext('2d');
x.fillStyle='#fff';x.fillRect(0,0,728,180);x.fillStyle='#e11d48';x.fillRect(12,12,704,80);
x.fillStyle='#fff';x.font='bold 52px sans-serif';x.fillText('MEGA SALE -50%',60,72);
x.fillStyle='#1d4ed8';x.font='bold 28px sans-serif';x.fillText('Buy now! Shop the limited offer today',60,150);return c.toDataURL('image/png');}
function plainUrl(){const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');
const g=x.createLinearGradient(0,0,0,300);g.addColorStop(0,'#7ec8ff');g.addColorStop(1,'#bfe3a6');x.fillStyle=g;x.fillRect(0,0,400,300);
x.fillStyle='#3a7d2c';x.beginPath();x.arc(120,230,70,0,7);x.fill();x.fillStyle='#ffd24a';x.beginPath();x.arc(320,70,42,0,7);x.fill();return c.toDataURL('image/png');}
document.getElementById('ad').src=adBannerUrl();
document.getElementById('plain').src=plainUrl();
window.__fixtureReady=true;
</script></body></html>`

const server = createServer((_q, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(PAGE_HTML)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const url = `http://127.0.0.1:${server.address().port}/`

const profileDir = await mkdtemp(join(tmpdir(), "cnd-vision-e2e-"))
let context
let ok = false
try {
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: BROWSER_EXE,
    headless: false,
    viewport: { width: 1100, height: 900 },
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
  if (!extId) throw new Error("no extension service worker")
  console.log("EXT ID:", extId)

  const page = await context.newPage()
  page.on("console", (m) => {
    if (m.type() === "error") console.log("PAGE ERR:", m.text())
  })
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => window.__fixtureReady === true, { timeout: 15000 })
  await page.waitForFunction(
    () => {
      const a = document.getElementById("ad")
      const p = document.getElementById("plain")
      return a && p && a.complete && p.complete && a.naturalWidth > 0 && p.naturalWidth > 0
    },
    { timeout: 15000 }
  )
  console.log("fixture images ready")

  // Drive the real path: ensure the offscreen exists, then tell the tab's content
  // script to scan (the exact message the background sends on shortcut/button).
  const ext = await context.newPage()
  await ext.goto(`chrome-extension://${extId}/popup.html`, {
    waitUntil: "domcontentloaded"
  })
  const trigger = await ext.evaluate(async (pageUrl) => {
    try {
      const has = await chrome.offscreen.hasDocument?.()
      if (!has) {
        await chrome.offscreen.createDocument({
          url: "assets/offscreen/offscreen.html",
          reasons: ["WORKERS"],
          justification: "vision ad-image classification"
        })
      }
    } catch (e) {
      // may already exist
    }
    const tabs = await chrome.tabs.query({})
    const tab = tabs.find((t) => t.url === pageUrl)
    if (!tab?.id) return { ok: false, error: "fixture tab not found" }
    const res = await chrome.tabs.sendMessage(tab.id, { type: "CND_VISION_SCAN" })
    return { ok: true, res }
  }, url)
  console.log("TRIGGER:", JSON.stringify(trigger))

  const started = Date.now()
  let state = {}
  while (Date.now() - started < TIMEOUT_MS) {
    state = await page.evaluate(() => {
      const a = document.getElementById("ad")
      const p = document.getElementById("plain")
      const attr = (el) => (el ? el.getAttribute("data-cnd-vision") : null)
      const blurred = (el) => {
        if (!el) return false
        const f = (el.style && el.style.filter) || ""
        return /blur\(/.test(f)
      }
      const last = window.__CND_VISION_LAST || null
      return {
        adAttr: attr(a),
        plainAttr: attr(p),
        adBlurred: blurred(a),
        last,
        badges: document.querySelectorAll("[data-cnd-vision-badge]").length
      }
    })
    // data-cnd-vision is a DOM attribute the content script stamps — readable
    // cross-world. (window.__CND_VISION_LAST lives in the isolated content world,
    // so we rely on the DOM + the trigger's ScanResult instead.)
    if (state.adAttr || state.plainAttr) break
    await sleep(2000)
  }

  console.log("STATE:", JSON.stringify(state))
  console.log("SCAN RESULT:", JSON.stringify(trigger?.res?.result ?? trigger?.res))
  ok = state.adAttr === "ad" && state.adBlurred === true
  console.log(
    "VERDICT:",
    ok
      ? "PASS — ad image classified AD and blurred by the live offscreen SmolVLM"
      : `FAIL — adAttr=${state.adAttr} adBlurred=${state.adBlurred} plainAttr=${state.plainAttr}`
  )
} catch (e) {
  console.log("FAIL:", e?.stack || e?.message || String(e))
} finally {
  server.close()
  if (context) await Promise.race([context.close().catch(() => {}), sleep(8000)])
  await rm(profileDir, { recursive: true, force: true }).catch(() => {})
}
process.exit(ok ? 0 : 1)
