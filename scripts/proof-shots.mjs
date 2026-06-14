// Proof-of-working capture: launch the freshly-built PrivacyMyst extension in Edge
// and screenshot the four headline things working —
//   01 popup (PrivacyMyst brand)
//   02 in-extension Licenses / Legal screen
//   03 AI Deep-Dive local-LLM verdict on a sensitive page
//   04 AI vision ad-image blocker blurring an ad image
// Saved to docs/proof/.
import { createRequire } from "node:module"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "node:path"
import { mkdir } from "node:fs/promises"

const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXT = join(ROOT, "build", "chrome-mv3-prod")
const OUT = join(ROOT, "docs", "proof")
const BROWSER_EXE =
  process.env.LLM_VERIFY_BROWSER_EXE ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const PROFILE = join(ROOT, "build", "privacymyst-proof-profile")
const MODEL = process.env.PROOF_MODEL || "gemma-3-1b"
const CONFIG_KEY = "cnd:ai-deep-dive:config"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SENSITIVE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="description" content="Coping with depression, eviction, bankruptcy and urgent debt support."/>
<title>Coping With Depression and Debt</title></head>
<body style="font-family:system-ui;max-width:760px;margin:40px auto;padding:0 16px;color:#111">
<h1>Coping With Depression and Debt</h1>
<p>This article discusses depression symptoms, suicidal thoughts, therapy, unpaid debt,
debt collectors, eviction fear, bankruptcy risk, urgent financial hardship support, and
how sensitive browsing behavior can be profiled.</p></body></html>`

const ADS_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>Ad fixture</title></head>
<body style="font-family:system-ui;max-width:820px;margin:32px auto;padding:0 16px;color:#111">
<h1>Strona z reklamami i normalnym obrazkiem</h1>
<p>Detektor AI powinien rozmyć baner reklamowy, a normalny obrazek zostawić.</p>
<img id="ad" alt="ad"/><p>Artykuł poniżej...</p><img id="plain" alt="plain"/>
<script>
function adUrl(){const c=document.createElement('canvas');c.width=728;c.height=180;const x=c.getContext('2d');
x.fillStyle='#fff';x.fillRect(0,0,728,180);x.fillStyle='#e11d48';x.fillRect(12,12,704,80);
x.fillStyle='#fff';x.font='bold 52px sans-serif';x.fillText('MEGA SALE -50%',60,72);
x.fillStyle='#1d4ed8';x.font='bold 28px sans-serif';x.fillText('Buy now! Shop the limited offer today',60,150);return c.toDataURL('image/png');}
function plainUrl(){const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');
const g=x.createLinearGradient(0,0,0,300);g.addColorStop(0,'#7ec8ff');g.addColorStop(1,'#bfe3a6');x.fillStyle=g;x.fillRect(0,0,400,300);
x.fillStyle='#3a7d2c';x.beginPath();x.arc(120,230,70,0,7);x.fill();x.fillStyle='#ffd24a';x.beginPath();x.arc(320,70,42,0,7);x.fill();return c.toDataURL('image/png');}
document.getElementById('ad').src=adUrl();document.getElementById('plain').src=plainUrl();window.__ready=true;
</script></body></html>`

const server = createServer((q, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(q.url && q.url.includes("ads") ? ADS_HTML : SENSITIVE_HTML)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
await mkdir(OUT, { recursive: true })

let context
const shots = []
const shot = async (page, name) => {
  const p = join(OUT, name)
  await page.screenshot({ path: p })
  shots.push(name)
  console.log("SHOT", name)
}
try {
  context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: BROWSER_EXE,
    headless: false,
    viewport: { width: 1180, height: 900 },
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

  // ---- config: enable AI mode + model, accept Gemma consent ----
  const ext = await context.newPage()
  await ext.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "domcontentloaded" })
  await ext.evaluate(
    ({ configKey, model }) =>
      new Promise((res) => {
        chrome.storage.local.set(
          {
            [configKey]: { aiModeEnabled: true, selectedModelId: model, nliMinHeuristicScore: 25, maxSnippetChars: 2500 },
            "cnd:gemma-consent": { accepted: true, ts: 1 }
          },
          () => res()
        )
      }),
    { configKey: CONFIG_KEY, model: MODEL }
  )
  await ext.reload({ waitUntil: "networkidle" })
  await sleep(800)
  await shot(ext, "01-popup-privacymyst.png")

  // ---- 02 licenses / legal ----
  const lic = await context.newPage()
  await lic.goto(`chrome-extension://${extId}/tabs/licenses.html`, { waitUntil: "networkidle" })
  await sleep(700)
  await shot(lic, "02-licenses-legal.png")
  await lic.close()

  // ---- 03 AI Deep-Dive verdict on a sensitive page ----
  const page = await context.newPage()
  await page.goto(`${base}/sensitive`, { waitUntil: "domcontentloaded" })
  try {
    await page.waitForSelector("#cloak-dagger-floating-root", { state: "attached", timeout: 30000 })
    await page.locator('[data-cloak-dagger="bubble"]').click()
    await page.locator('[data-cloak-dagger="panel"]').waitFor({ timeout: 10000 })
    await page.getByText("Skanuj ponownie").click().catch(() => {})
    await sleep(600)
    await page.getByText("Głęboki skan").click()
    // wait up to 4 min for the LLM verdict
    for (let i = 0; i < 120; i++) {
      const src = (await page.locator('[data-feature="ai-profiling-detector"] .src').textContent().catch(() => "")) || ""
      if (/(llm-json|lokalny LLM)/i.test(src)) break
      await sleep(2000)
    }
    await sleep(800)
    await shot(page, "03-ai-deepdive-llm-verdict.png")
  } catch (e) {
    console.log("deepdive step:", e?.message || e)
    await shot(page, "03-ai-deepdive-llm-verdict.png")
  }
  await page.close()

  // ---- 04 vision ad-image blocker ----
  const ads = await context.newPage()
  await ads.goto(`${base}/ads`, { waitUntil: "domcontentloaded" })
  await ads.waitForFunction(() => window.__ready === true, { timeout: 15000 }).catch(() => {})
  await ads.waitForFunction(() => {
    const a = document.getElementById("ad"); return a && a.complete && a.naturalWidth > 0
  }, { timeout: 15000 }).catch(() => {})
  // ensure offscreen + trigger the scan (the message the shortcut/button send)
  await ext.evaluate(async (pageUrl) => {
    try {
      if (!(await chrome.offscreen.hasDocument?.())) {
        await chrome.offscreen.createDocument({ url: "assets/offscreen/offscreen.html", reasons: ["WORKERS"], justification: "vision proof" })
      }
    } catch (e) {}
    const tabs = await chrome.tabs.query({})
    const tab = tabs.find((t) => (t.url || "").includes("/ads"))
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "CND_VISION_SCAN" })
  }, `${base}/ads`)
  for (let i = 0; i < 60; i++) {
    const blurred = await ads.evaluate(() => {
      const a = document.getElementById("ad")
      return a && a.getAttribute("data-cnd-vision") === "ad"
    })
    if (blurred) break
    await sleep(2000)
  }
  await sleep(800)
  await shot(ads, "04-vision-adblock.png")

  console.log("PROOF SHOTS:", shots.join(", "))
} catch (e) {
  console.log("FAIL:", e?.stack || e?.message || String(e))
} finally {
  server.close()
  if (context) await Promise.race([context.close().catch(() => {}), sleep(8000)])
}
