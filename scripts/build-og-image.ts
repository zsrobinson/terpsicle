// Draws the link-preview image for `/` (public/og.png, 1200×630) from the
// hero's own geometry, marks and light-theme colors, so it matches the page:
// five rails straightening out of a ghost of the tangle, each ending in its
// product's mark, under the umbrella. No words: the preview's title and
// description sit beside it. Regenerate after changing the hero or palette:
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
  linePoints,
  type Point,
  PRODUCT_ORDER,
  smoothPath,
  TANGLE_SIZE,
} from "~/features/marketing/tangle";
import { isMain, ROOT } from "./lib/source-files";

export const OG_FILE = path.join("public", OG_IMAGE.path);

const { width: W, height: H } = OG_IMAGE;
/** Where the hero's wide drawing goes; the marks sit past its right edge. */
const AREA = { x: 80, y: 130, width: 900, height: 420 };
const MARK = 64;

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

export function ogSvg(): string {
  const tokens = readTokens(
    readFileSync(path.join(ROOT, "src/styles.css"), "utf8"),
  ).light;
  const { width: tw, height: th } = TANGLE_SIZE.wide;
  const place = (points: Point[]): Point[] =>
    points.map(([x, y]) => [
      AREA.x + (x / tw) * AREA.width,
      AREA.y + (y / th) * AREA.height,
    ]);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${pick(tokens, "bg")}"/>`,
    placedMark(tokens, "umbrella", AREA.x, 44, 52),
  ];
  // The tangle, as the ghost it leaves behind.
  PRODUCT_ORDER.forEach((_, i) => {
    parts.push(
      `<path d="${smoothPath(place(linePoints("wide", i, 0)))}" fill="none" stroke="${pick(tokens, "hairline-strong")}" stroke-width="3" stroke-dasharray="5 9" stroke-linecap="round" opacity="0.7"/>`,
    );
  });
  PRODUCT_ORDER.forEach((id, i) => {
    const rail = place(linePoints("wide", i, 1));
    parts.push(
      `<path d="${smoothPath(rail)}" fill="none" stroke="${pick(tokens, `product-${id}-line`)}" stroke-width="7" stroke-linecap="round"/>`,
    );
    const end = rail.at(-1) ?? [0, 0];
    parts.push(placedMark(tokens, id, end[0] + 30, end[1] - MARK / 2, MARK));
  });
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
