// The family in one picture (docs/COHESION.md §5, "Every UI PR shows the
// family, not just itself"): each product's main page, side by side, at a
// desktop and a phone width, in light and dark. Run it against `pnpm
// dev:mock` and put the grids in the PR.
//
//   pnpm tsx scripts/shots.ts [--url http://localhost:3000] [--out shots]
//     [--signed-in] [--only schedule,todo]
//
// Signed in uses test mode's sign-in, as the e2e specs do. Writes one PNG
// per page, size and theme, and a grid per size and theme
// (`grid-desk-light.png`, …).

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { type Browser, chromium, type Page } from "@playwright/test";
import { chromiumExecutable } from "./lib/chromium";

const PAGES = [
  { id: "schedule", path: "/schedule?demo=1" },
  { id: "reviews", path: "/reviews" },
  { id: "chat", path: "/chat" },
  { id: "plan", path: "/plan" },
  { id: "todo", path: "/todo" },
  { id: "settings", path: "/settings" },
] as const;

const SIZES = [
  { id: "desk", width: 1440, height: 900, mobile: false },
  { id: "phone", width: 390, height: 844, mobile: true },
] as const;

const THEMES = ["light", "dark"] as const;

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    out: { type: "string", default: "shots" },
    "signed-in": { type: "boolean", default: false },
    only: { type: "string" },
  },
});

const base = values.url.replace(/\/$/, "");
const out = path.resolve(values.out);
const only = values.only?.split(",");
const pages = PAGES.filter((p) => !only || only.includes(p.id));

/** Signs the page's browser context in as the test student. */
async function signIn(page: Page): Promise<void> {
  await page.goto(`${base}/privacy`);
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "tstudent", return: "/settings" }),
    });
    return response.status;
  });
  if (status !== 200) throw new Error(`Test sign-in answered ${status}`);
}

async function shoot(browser: Browser): Promise<void> {
  mkdirSync(out, { recursive: true });
  for (const size of SIZES)
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        colorScheme: theme,
        isMobile: size.mobile,
        hasTouch: size.mobile,
      });
      // The saved theme wins over the system's (src/app/theme.ts).
      await context.addInitScript((t) => {
        try {
          localStorage.setItem("terpsicle:theme", t);
        } catch {}
      }, theme);
      const page = await context.newPage();
      if (values["signed-in"]) await signIn(page);
      const files: string[] = [];
      for (const { id, path: at } of pages) {
        await page.goto(`${base}${at}`, { waitUntil: "networkidle" });
        // Fonts, skeletons and the first data settle.
        await page.waitForTimeout(1500);
        const file = `${id}-${size.id}-${theme}.png`;
        await page.screenshot({ path: path.join(out, file) });
        files.push(file);
      }
      await context.close();
      await grid(browser, files, `grid-${size.id}-${theme}.png`, size.width);
      console.log(`${size.id} ${theme}: ${files.length} pages`);
    }
}

/** Lays the shots out in a row and screenshots that. */
async function grid(
  browser: Browser,
  files: string[],
  name: string,
  width: number,
): Promise<void> {
  const scale = width > 800 ? 0.35 : 0.6;
  const cell = Math.round(width * scale);
  const html = `<!doctype html><body style="margin:0;background:#888;display:flex;gap:8px;padding:8px;align-items:flex-start">${files
    .map(
      (f) =>
        `<figure style="margin:0;font:12px system-ui;color:#fff"><img src="${f}" width="${cell}"><figcaption>${f.split("-")[0]}</figcaption></figure>`,
    )
    .join("")}</body>`;
  const file = path.join(out, `${name}.html`);
  writeFileSync(file, html);
  const page = await browser.newPage();
  await page.goto(`file://${file}`);
  await page.screenshot({ path: path.join(out, name), fullPage: true });
  await page.close();
}

const executablePath = chromiumExecutable();
const browser = await chromium.launch(
  executablePath ? { executablePath } : undefined,
);
try {
  await shoot(browser);
  console.log(`Wrote ${out}`);
} finally {
  await browser.close();
}
