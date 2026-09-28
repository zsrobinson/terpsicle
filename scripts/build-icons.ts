// Draws every icon file from the umbrella mark (src/app/brand/marks.ts), in
// the colors of src/styles.css, so a refined mark or palette is one edit and
// one command:
//
//   pnpm tsx scripts/build-icons.ts
//
// Writes public/icons/: the favicon (SVG and a 32px PNG), the iOS home-screen
// icon (180), the web app icons (192, 512, and a maskable 512 whose glyph
// sits inside Android's 80% safe circle), and the notification badge (72).
// All of them are the umbrella's tile alone, with no offset (the owner,
// 2026-09-28), and the same in both themes: the tile is black in both.
// scripts/build-icons.test.ts fails when these files are out of date.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { readTokens, type TokenTable } from "~/app/brand/css-tokens";
import { type MarkRole, type MarkVariant, markSvg } from "~/app/brand/marks";
import { isMain, ROOT } from "./lib/source-files";

export interface IconFile {
  /** Under public/. */
  file: string;
  /** Pixels, for a PNG. */
  size: number;
  variant: MarkVariant;
  /**
   * The size the mark is drawn for, which sets its pixel grid: the glyph's
   * units land on whole pixels at this size.
   */
  drawAt: number;
}

export const ICON_DIR = "icons";

export const FAVICON_SVG = `${ICON_DIR}/favicon.svg`;

export const PNG_ICONS: readonly IconFile[] = [
  // Every icon is the tile alone: the OS (or the tab) frames it.
  {
    file: `${ICON_DIR}/favicon-32.png`,
    size: 32,
    variant: "bleed",
    drawAt: 32,
  },
  {
    file: `${ICON_DIR}/apple-touch-icon.png`,
    size: 180,
    variant: "bleed",
    drawAt: 180,
  },
  {
    file: `${ICON_DIR}/icon-192.png`,
    size: 192,
    variant: "bleed",
    drawAt: 192,
  },
  {
    file: `${ICON_DIR}/icon-512.png`,
    size: 512,
    variant: "bleed",
    drawAt: 512,
  },
  {
    file: `${ICON_DIR}/icon-maskable-512.png`,
    size: 512,
    variant: "maskable",
    drawAt: 512,
  },
];

/**
 * Android's status-bar icon for a notification (src/server/service-worker.ts):
 * the glyph alone, solid white on clear, since only its alpha is used (a 50%
 * canopy would come out half there).
 */
export const BADGE: IconFile = {
  file: `${ICON_DIR}/badge-72.png`,
  size: 72,
  variant: "bleed",
  drawAt: 72,
};

const BADGE_COLORS: Record<MarkRole, string> = {
  tile: "none",
  glyph: "#ffffff",
  keyline: "none",
  offset: "none",
};

export function badgeSvg(): string {
  return markSvg("umbrella", BADGE.drawAt, BADGE_COLORS, {
    variant: BADGE.variant,
    solid: true,
  });
}

export function badgePng(): Buffer {
  return new Resvg(badgeSvg(), {
    fitTo: { mode: "width", value: BADGE.size },
  })
    .render()
    .asPng();
}

/** The umbrella's paints in one theme. */
function umbrellaColors(tokens: TokenTable): Record<MarkRole, string> {
  const pick = (name: string) => {
    const value = tokens[name];
    if (!value) throw new Error(`src/styles.css has no --${name}`);
    return value;
  };
  return {
    tile: pick("umbrella-tile"),
    glyph: pick("umbrella-glyph"),
    keyline: pick("umbrella-keyline"),
    offset: pick("umbrella-offset"),
  };
}

function readThemes() {
  return readTokens(readFileSync(path.join(ROOT, "src/styles.css"), "utf8"));
}

/**
 * The favicon: the 32px PNG's drawing, so it's crisp on a sharp screen. One
 * drawing for both themes: a tab strip is never as black as the tile, and
 * the white umbrella carries it either way.
 */
export function faviconSvg(): string {
  return `${markSvg("umbrella", 32, umbrellaColors(readThemes().light), {
    variant: "bleed",
    title: "Terpsicle",
  })}\n`;
}

export function iconSvg(icon: IconFile): string {
  return markSvg("umbrella", icon.drawAt, umbrellaColors(readThemes().light), {
    variant: icon.variant,
  });
}

export function iconPng(icon: IconFile): Buffer {
  return new Resvg(iconSvg(icon), {
    fitTo: { mode: "width", value: icon.size },
  })
    .render()
    .asPng();
}

function main() {
  const dir = path.join(ROOT, "public", ICON_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(ROOT, "public", FAVICON_SVG), faviconSvg());
  for (const icon of PNG_ICONS)
    writeFileSync(path.join(ROOT, "public", icon.file), iconPng(icon));
  writeFileSync(path.join(ROOT, "public", BADGE.file), badgePng());
  console.log(
    `Wrote ${[FAVICON_SVG, ...PNG_ICONS.map((i) => i.file), BADGE.file].join(", ")}`,
  );
}

if (isMain(import.meta.url)) main();
