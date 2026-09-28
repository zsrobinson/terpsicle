// Draws the link-preview image for `/` (public/og.png, 1200×630) from the
// page's own sample week (src/features/marketing/story/plan-a.ts), the marks
// and the light theme's colors, so it matches the page: the umbrella and the
// five products' marks beside Plan A's week, blocks in their course tints,
// the Work block hatched and the tight walk's pill. No words: the preview's
// title and description sit beside it. Regenerate after changing the sample
// week, the marks or the palette:
//
//   pnpm tsx scripts/build-og-image.ts
//
// scripts/build-og-image.test.ts fails when the file is out of date.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { readTokens, type TokenTable } from "~/app/brand/css-tokens";
import { type MarkId, type MarkRole, markSvg } from "~/app/brand/marks";
import { OG_IMAGE } from "~/features/marketing/meta";
import {
  START,
  WORK_BLOCK,
  walksOf,
  weekEntries,
} from "~/features/marketing/story/plan-a";
import { isMain, ROOT } from "./lib/source-files";

export const OG_FILE = path.join("public", OG_IMAGE.path);

const { width: W, height: H } = OG_IMAGE;

const PRODUCTS = ["schedule", "reviews", "chat", "plan", "todo"] as const;

/** The week's window: its frame, the day header and the hours drawn. */
const WINDOW = { x: 400, y: 64, width: 736, height: 488 };
const HEADER = 40;
const GUTTER = 48;
const FIRST_HOUR = 8;
const LAST_HOUR = 17;

function pick(tokens: TokenTable, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`src/styles.css has no --${name}`);
  return value;
}

function markColors(tokens: TokenTable, id: MarkId): Record<MarkRole, string> {
  if (id === "umbrella")
    return {
      tile: pick(tokens, "umbrella-tile"),
      glyph: pick(tokens, "umbrella-glyph"),
      keyline: pick(tokens, "umbrella-keyline"),
      offset: pick(tokens, "umbrella-offset"),
    };
  return {
    tile: pick(tokens, `product-${id}`),
    glyph: pick(tokens, `product-${id}-fg`),
    keyline: tokens[`product-${id}-keyline`] ?? pick(tokens, "keyline"),
    offset: pick(tokens, "mark-offset"),
  };
}

/** A mark as a nested <svg> at (x, y). */
function placedMark(
  tokens: TokenTable,
  id: MarkId,
  x: number,
  y: number,
  size: number,
): string {
  return markSvg(id, size, markColors(tokens, id), { theme: "light" }).replace(
    "<svg ",
    `<svg x="${x}" y="${y}" `,
  );
}

const r = (n: number) => Math.round(n * 10) / 10;

export function ogSvg(): string {
  const tokens = readTokens(
    readFileSync(path.join(ROOT, "src/styles.css"), "utf8"),
  ).light;
  const ink = pick(tokens, "keyline");
  const grid = pick(tokens, "grid");
  const body = {
    x: WINDOW.x + GUTTER,
    y: WINDOW.y + HEADER,
    width: WINDOW.width - GUTTER,
    height: WINDOW.height - HEADER,
  };
  const dayWidth = body.width / 5;
  const hour = body.height / (LAST_HOUR - FIRST_HOUR);
  const yOf = (minutes: number) =>
    body.y + ((minutes - FIRST_HOUR * 60) / 60) * hour;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><pattern id="stripes" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="12" fill="${grid}"/></pattern></defs>`,
    `<rect width="${W}" height="${H}" fill="${pick(tokens, "bg")}"/>`,
    // The family: the umbrella, and its five products under it.
    placedMark(tokens, "umbrella", 72, 196, 128),
    ...PRODUCTS.map((id, i) => placedMark(tokens, id, 72 + i * 56, 372, 44)),
    // The window, with its offset.
    `<rect x="${WINDOW.x + 6}" y="${WINDOW.y + 6}" width="${WINDOW.width}" height="${WINDOW.height}" fill="${pick(tokens, "offset-ink")}"/>`,
    `<rect x="${WINDOW.x}" y="${WINDOW.y}" width="${WINDOW.width}" height="${WINDOW.height}" fill="${pick(tokens, "raised")}" stroke="${ink}" stroke-width="2"/>`,
    `<line x1="${WINDOW.x}" y1="${body.y}" x2="${WINDOW.x + WINDOW.width}" y2="${body.y}" stroke="${pick(tokens, "hairline")}" stroke-width="2"/>`,
  ];
  for (let h = 1; h < LAST_HOUR - FIRST_HOUR; h++)
    parts.push(
      `<line x1="${body.x}" y1="${r(body.y + h * hour)}" x2="${body.x + body.width}" y2="${r(body.y + h * hour)}" stroke="${grid}" stroke-width="2"/>`,
    );
  for (let d = 0; d < 5; d++)
    parts.push(
      `<line x1="${r(body.x + d * dayWidth)}" y1="${WINDOW.y}" x2="${r(body.x + d * dayWidth)}" y2="${WINDOW.y + WINDOW.height}" stroke="${pick(tokens, "hairline")}" stroke-width="2"/>`,
    );
  // Work, Friday afternoon, hatched.
  {
    const x = body.x + WORK_BLOCK.day * dayWidth + 4;
    const y = yOf(WORK_BLOCK.start) + 2;
    const w = dayWidth - 8;
    const h = yOf(WORK_BLOCK.end) - yOf(WORK_BLOCK.start) - 4;
    parts.push(
      `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="${pick(tokens, "panel")}"/>`,
      `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" fill="url(#stripes)" stroke="${pick(tokens, "hairline")}" stroke-width="2"/>`,
    );
  }
  for (const e of weekEntries(START)) {
    const lane = (dayWidth - 8) / e.lanes;
    const x = body.x + e.day * dayWidth + 4 + e.lane * lane;
    const y = yOf(e.start) + 2;
    const h = yOf(e.end) - yOf(e.start) - 4;
    const c = `course-${e.course.color}`;
    parts.push(
      `<rect x="${r(x + 1)}" y="${r(y)}" width="${r(lane - 2)}" height="${r(h)}" fill="${pick(tokens, `${c}-bg`)}" stroke="${pick(tokens, `${c}-border`)}" stroke-width="2"/>`,
      // Where the code would be: a bar in the block's ink.
      `<rect x="${r(x + 9)}" y="${r(y + 9)}" width="${r(Math.min(lane - 20, 62))}" height="8" fill="${pick(tokens, `${c}-fg`)}" opacity="0.8"/>`,
    );
  }
  for (const w of walksOf(START)) {
    const cx = body.x + w.day * dayWidth + dayWidth / 2;
    const cy = yOf(w.at);
    parts.push(
      `<rect x="${r(cx - 26)}" y="${r(cy - 11)}" width="52" height="22" rx="11" fill="${pick(tokens, "raised")}" stroke="${pick(tokens, "warn")}" stroke-width="2"/>`,
      // A warning triangle, and a bar where "8 min" would be.
      `<path d="M${r(cx - 17)} ${r(cy + 5)}L${r(cx - 11)} ${r(cy - 6)}L${r(cx - 5)} ${r(cy + 5)}Z" fill="none" stroke="${pick(tokens, "warn")}" stroke-width="2" stroke-linejoin="round"/>`,
      `<rect x="${r(cx - 1)}" y="${r(cy - 2)}" width="16" height="4" fill="${pick(tokens, "warn")}"/>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}

export function ogPng(): Buffer {
  return new Resvg(ogSvg(), { fitTo: { mode: "width", value: W } })
    .render()
    .asPng();
}

function main() {
  writeFileSync(path.join(ROOT, OG_FILE), ogPng());
  console.log(`Wrote ${OG_FILE}`);
}

if (isMain(import.meta.url)) main();
