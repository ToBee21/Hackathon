import { createServer } from "node:http"
import { access, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { chromium, expect, test } from "@playwright/test"

const ROOT = path.resolve(__dirname, "..")
const EXTENSION_PATH = path.join(ROOT, "build", "chrome-mv3-prod")
const PROOF_PAGE = path.join(ROOT, "demo", "bionic-blur-proof.html")
const PROOF_SCREENSHOT = path.join(ROOT, "test-results", "bionic-blur-proof.png")
const BROWSER_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROME_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean) as string[]

async function resolveBrowserPath(): Promise<string> {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next installed Chromium browser.
    }
  }
  throw new Error("No local Chrome or Edge executable found for extension smoke")
}

test("Bionic Blur patches main-world signals on the proof page", async () => {
  await stat(path.join(EXTENSION_PATH, "manifest.json"))
  await stat(PROOF_PAGE)

  const html = await readFile(PROOF_PAGE)
  const server = createServer((req, res) => {
    if (req.url === "/" || req.url === "/bionic-blur-proof.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      res.end(html)
      return
    }
    res.writeHead(404)
    res.end("not found")
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Proof server did not bind to a TCP port")
  }

  const userDataDir = await mkdtemp(path.join(tmpdir(), "cnd-bionic-smoke-"))
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: await resolveBrowserPath(),
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
      "--no-first-run",
      "--no-default-browser-check"
    ]
  })

  try {
    const page = await context.newPage()
    await page.goto(`http://127.0.0.1:${address.port}/bionic-blur-proof.html`)
    await page.waitForFunction(
      () => Boolean((window as Window & { __cloakDaggerBionicBlurInstalled?: boolean }).__cloakDaggerBionicBlurInstalled),
      undefined,
      { timeout: 10000 }
    )

    const box = await page.locator("#pointer-zone").boundingBox()
    if (!box) throw new Error("Pointer proof zone is missing")

    const selectAll = process.platform === "darwin" ? "Meta+A" : "Control+A"
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await page.mouse.move(box.x + 20, box.y + 20 + cycle * 6)
      await page.mouse.move(box.x + box.width - 30, box.y + 60 + cycle * 8, {
        steps: 8
      })
      await page.mouse.move(box.x + 70 + cycle * 12, box.y + box.height - 40, {
        steps: 8
      })

      await page.locator("#proof-input").focus()
      await page.keyboard.press(selectAll)
      await page.keyboard.type(`privacytest-${cycle}`)
      await page.locator("#proof-textarea").focus()
      await page.keyboard.press(selectAll)
      await page.keyboard.type(`textarea proof ${cycle}`)
      await page.locator("#proof-editable").focus()
      await page.keyboard.press(selectAll)
      await page.keyboard.type(`editable proof ${cycle}`)
      await page.locator("#run-probes").click()
      await page.waitForTimeout(1800)
    }

    try {
      await expect
        .poll(
          async () =>
            page.locator("#status").evaluate((node) => node.textContent ?? ""),
          { timeout: 15000 }
        )
        .toContain("PASS")
      await expect
        .poll(
          async () =>
            Number(await page.locator("#api-count").evaluate((node) => node.textContent ?? "0")),
          { timeout: 7000 }
        )
        .toBeGreaterThanOrEqual(3)
      await mkdir(path.dirname(PROOF_SCREENSHOT), { recursive: true })
      await page.screenshot({ path: PROOF_SCREENSHOT, fullPage: true })
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        status: document.querySelector("#status")?.textContent,
        score: document.querySelector("#score")?.textContent,
        apiRuns: document.querySelector("#api-count")?.textContent,
        cycle: document.querySelector("#cycle-label")?.textContent,
        mouse: document.querySelector("#mouse-count")?.textContent,
        keys: document.querySelector("#key-count")?.textContent,
        log: document.querySelector("#log")?.textContent?.slice(0, 2000)
      }))
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(
          diagnostics,
          null,
          2
        )}`
      )
    }
  } finally {
    await context.close()
    server.close()
    await rm(userDataDir, { recursive: true, force: true })
  }
})
