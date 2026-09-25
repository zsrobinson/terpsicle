import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium, defineConfig, devices } from "@playwright/test";
import {
  alertsHarnessPort,
  CHECKOUT_MARKER_PATH,
  checkoutId,
  e2ePort,
} from "./scripts/e2e-checkout";

// Each checkout gets its own pair of ports (E2E_PORT overrides them), and
// Playwright waits on a marker URL that only this checkout's servers answer
// with 200. Locally a running server on those ports is reused only if it's
// ours; another checkout's makes the run fail at startup instead of silently
// testing its code. README.md, "End-to-end tests".
const ROOT = import.meta.dirname;
const PORT = e2ePort(ROOT);
/** The seat-alert e2e's local API (e2e/alerts-harness). */
const ALERTS_PORT = alertsHarnessPort(ROOT);
const MARKER = `${CHECKOUT_MARKER_PATH}/${checkoutId(ROOT)}`;
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
  webServer: [
    {
      // Fixtures only: e2e never touches the network. `dev:mock` applies the
      // local D1 migrations first.
      command: `pnpm dev:mock --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}${MARKER}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      // The real /api router and seat-alert code over local D1 and R2, with a
      // capturing EMAIL binding (e2e/seat-alerts.spec.ts).
      command: `pnpm tsx scripts/e2e-alerts-harness.ts ${ALERTS_PORT}`,
      url: `http://localhost:${ALERTS_PORT}${MARKER}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
