import { defineConfig } from "@playwright/test";
import live from "./playwright.live.config";

export default defineConfig({
  ...live,
  testIgnore: [],
  testMatch: "freshness.spec.ts",
});
