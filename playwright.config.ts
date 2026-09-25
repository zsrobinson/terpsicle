import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium, defineConfig, devices } from "@playwright/test";

// E2E_PORT lets checkouts side by side run e2e at once: locally an existing
// server on the port is reused, which would test the other checkout's code.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const isCI = Boolean(process.env.CI);

// CI installs the browser this Playwright version expects. Local agent
// sandboxes ship a preinstalled Chromium under PLAYWRIGHT_BROWSERS_PATH that
// may be an older revision (and must not be reinstalled), so fall back to the
// newest one found there when the expected build is missing.
function chromiumExecutable(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const newest = readdirSync(root)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))[0];
  if (!newest) return undefined;
  const binary = path.join(root, newest, "chrome-linux", "chrome");
  return existsSync(binary) ? binary : undefined;
}

const executablePath = chromiumExecutable();

export default defineConfig({
  testDir: "e2e",
  // Real data, against a deployment: playwright.live.config.ts.
  testIgnore: "live/**",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      // SPEC.md §2: the same shell on phones, sidebar as a bottom drawer.
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // Fixtures only: e2e never touches the network.
    command: `pnpm dev:mock --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
