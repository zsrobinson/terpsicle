import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// Checks that need the production build: its hashed, split chunks and Vite's
// loader, which dev doesn't have. Run after `pnpm build`:
// `pnpm test:e2e:build`. CI runs it in the build job.
const PORT = Number(process.env.E2E_BUILD_PORT ?? 4317);

export default defineConfig({
  testDir: "e2e/build",
  forbidOnly: base.forbidOnly,
  retries: base.retries,
  reporter: base.reporter,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
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
    command: `pnpm db:local && vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/?stay`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
