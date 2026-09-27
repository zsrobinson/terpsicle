import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

// CI installs the browser this Playwright version expects. Local agent
// sandboxes ship a preinstalled Chromium under PLAYWRIGHT_BROWSERS_PATH that
// may be an older revision (and must not be reinstalled), so fall back to the
// newest one found there when the expected build is missing.
export function chromiumExecutable(): string | undefined {
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
