import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const installedChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browserPath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (existsSync(installedChrome) ? installedChrome : undefined);

export default defineConfig({
  testDir: "./tests",
  testMatch: /(?:app\.spec|geometry\.test|agreement\.test)\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    launchOptions: { ...(browserPath ? { executablePath: browserPath } : {}) },
    viewport: { width: 1512, height: 982 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command:
        "MPLCONFIGDIR=private/matplotlib .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765",
      url: "http://127.0.0.1:8765/api/health",
      timeout: 90_000,
      reuseExistingServer: true,
    },
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      timeout: 60_000,
      reuseExistingServer: true,
    },
  ],
});
