// Tests whether the one-click --load-extension launcher actually loads
// PrivacyMyst in each installed Chromium browser (isolated profile, CDP-verified;
// no desktop UI automation). Prints per-browser loaded=true/false + ext id.
import { createRequire } from "node:module"
import { join } from "node:path"
const require = createRequire(import.meta.url)
const { chromium } = require("@playwright/test")

const EXT = process.env.EXT_DIR || "D:\\PrivacyMyst"
const ROOT = "D:\\poc1\\ToBee21-Hackathon"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browsers = [
  { name: "Edge",    exe: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" },
  { name: "Chrome",  exe: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
  { name: "Brave",   exe: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" },
  { name: "OperaGX", exe: "C:\\Users\\Huber\\AppData\\Local\\Programs\\Opera GX\\opera.exe" }
]

for (const b of browsers) {
  const profile = join(ROOT, "build", `launcher-test-${b.name}`)
  let ctx, loaded = false, extId = "", err = ""
  try {
    ctx = await chromium.launchPersistentContext(profile, {
      executablePath: b.exe,
      headless: false,
      timeout: 45000,
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=DisableLoadExtensionCommandLineSwitch",
        `--disable-extensions-except=${EXT}`,
        `--load-extension=${EXT}`
      ]
    })
    for (let i = 0; i < 20 && !loaded; i++) {
      const sw = ctx.serviceWorkers().find((s) => s.url().includes("chrome-extension://"))
      if (sw) { loaded = true; extId = new URL(sw.url()).host }
      else await sleep(1000)
    }
  } catch (e) {
    err = (e?.message || String(e)).split("\n")[0]
  } finally {
    if (ctx) await ctx.close().catch(() => {})
  }
  console.log(`BROWSER ${b.name} :: loaded=${loaded} id=${extId || "-"}${err ? " ERR=" + err : ""}`)
  await sleep(500)
}
