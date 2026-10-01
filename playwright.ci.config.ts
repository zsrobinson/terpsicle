import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// The required journeys. The complete suite stays available through
// playwright.config.ts and the Browser diagnostics workflow.
export default defineConfig({
  ...base,
  workers: 2,
  projects: [
    {
      name: "warm-up",
      testMatch: "warm-up.setup.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "desktop",
      testMatch: "**/*.spec.ts",
      grep: /@critical/,
      dependencies: ["warm-up"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testMatch: "**/*.spec.ts",
      grep: /@phone/,
      dependencies: ["warm-up"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "webkit",
      testMatch: "**/*.spec.ts",
      grep: /@phone/,
      dependencies: ["warm-up"],
      use: {
        ...devices["iPhone 15"],
        // A local Chromium executable is never a WebKit executable.
        launchOptions: {},
      },
    },
  ],
});
