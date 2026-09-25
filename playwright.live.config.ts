import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// A smoke check of a deployed app on real data: CI runs it against each PR's
// preview (which reads production R2). `LIVE_URL=<url> pnpm test:e2e:live`.
const url = process.env.LIVE_URL;
if (!url) throw new Error("Set LIVE_URL to the deployment to check.");

export default defineConfig({
  testDir: "e2e/live",
  retries: 1,
  timeout: 90_000,
  reporter: base.reporter,
  use: {
    ...base.use,
    baseURL: url,
    // Sandboxes that reach the internet only through a proxy.
    ...(process.env.HTTPS_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY } }
      : {}),
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
