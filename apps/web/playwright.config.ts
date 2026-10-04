import { defineConfig, devices } from "@playwright/test";
import { API_PORT, API_URL, WEB_PORT, WEB_URL, WS_URL } from "./e2e/env";

/**
 * End-to-end tests (TAN-12) against the real API in fixture mode: MOCK_AI=1 serves seed
 * fixtures instead of calling Claude/Presidio, DEMO_FALLBACK_RULES=1 loads the reference
 * guardrails so /guard/presave has rules without a published map. Voice is stubbed per test
 * (e2e/fixtures.ts), so no ElevenLabs traffic happens.
 *
 * Run: pnpm --filter @shadow/web exec playwright test
 * Needs the workspace packages built first (turbo run build --filter=@shadow/web^...).
 */

const CI = Boolean(process.env.CI);

// Outputs go under node_modules/.cache: ignored by git and by Biome without a root config change.
const OUT = "node_modules/.cache/playwright";

export default defineConfig({
  testDir: "./e2e",
  // *.e2e.ts, not *.spec.ts: vitest's default include would pick up *.spec.ts files.
  testMatch: "**/*.e2e.ts",
  outputDir: `${OUT}/results`,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: CI
    ? [["list"], ["html", { outputFolder: `${OUT}/report`, open: "never" }]]
    : [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "api",
      command: "pnpm --filter @shadow/api dev",
      url: `${API_URL}/health`,
      env: {
        MOCK_AI: "1",
        DEMO_FALLBACK_RULES: "1",
        API_PORT: String(API_PORT),
        WEB_ORIGIN: WEB_URL,
        LOG_LEVEL: "warn",
      },
      reuseExistingServer: !CI,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      name: "web",
      command: `pnpm --filter @shadow/web exec next dev --port ${WEB_PORT}`,
      url: WEB_URL,
      env: {
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_PUBLIC_API_WS_URL: WS_URL,
      },
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
