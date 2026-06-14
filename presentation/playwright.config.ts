import { defineConfig, devices } from "@playwright/test"

// Visual-regression config. Boots the built deck via `vite preview` and runs
// the specs in tests/. Baselines are generated on first run (--update-snapshots).
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "line",
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.04 } },
  use: {
    baseURL: "http://localhost:4317",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4317",
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
