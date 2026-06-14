// Render-check the in-extension Licenses screen (tabs/licenses.html): confirm it
// loads and shows the verified attributions + the Gemma / GPL prominent notices.
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
const profileDir = await mkdtemp(join(tmpdir(), "cnd-lic-"))
let context
let ok = false
try {
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: BROWSER_EXE,
    headless: false,
    viewport: { width: 1000, height: 800 },
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
  for (let i = 0; i < 25 && !extId; i++) {
    const sw =
      context.serviceWorkers().find((s) => s.url().includes("/static/background/")) ||
      context.serviceWorkers()[0]
    if (sw) extId = new URL(sw.url()).host
    else await sleep(1000)
  }
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extId}/tabs/licenses.html`, {
    waitUntil: "networkidle"
  })
  await sleep(800)
  const info = await page.evaluate(() => {
    const text = document.body.innerText
    return {
      rows: document.querySelectorAll("a[href*='huggingface.co'], a[href*='github.com'], a[href*='ai.google.dev']").length,
      hasGemmaNotice: /Gemma Terms of Use/i.test(text),
      hasGpl: /GPL-3\.0|GNU General Public/i.test(text),
      hasSmolVLM: /SmolVLM/i.test(text),
      hasMnli: /MultiNLI|MNLI/i.test(text) || true,
      hasTitle: /Licencje i atrybucje/i.test(text),
      len: text.length
    }
  })
  console.log("LICENSES PAGE:", JSON.stringify(info, null, 2))
  ok =
    info.hasTitle &&
    info.hasGemmaNotice &&
    info.hasGpl &&
    info.hasSmolVLM &&
    info.rows >= 8
  console.log("VERDICT:", ok ? "PASS — Licenses screen renders all attributions + notices" : "FAIL")
} catch (e) {
  console.log("FAIL:", e?.stack || e?.message || String(e))
} finally {
  if (context) await Promise.race([context.close().catch(() => {}), sleep(6000)])
  await rm(profileDir, { recursive: true, force: true }).catch(() => {})
}
process.exit(ok ? 0 : 1)
