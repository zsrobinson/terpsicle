// Rebuilds every app icon from one SVG, so a new mark is one file and one
// command:
//
//   pnpm tsx scripts/icons.ts [source.svg]      (default: public/favicon.svg)
//
// The source's first <rect> is its tile: the colored square behind the art.
// Icons that must fill their whole canvas (Android's maskable icon, iOS's
// home-screen icon, which the OS rounds itself) are drawn from the tile
// outward, with the tile's color filling the corners. The web app manifest
// (public/manifest.webmanifest) lists the files written here.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { isMain, ROOT } from "./lib/source-files";

export interface IconSpec {
  /** Written under public/. */
  file: string;
  size: number;
  /**
   * `transparent`: the mark as drawn, corners and all (browsers, desktop).
   * `full-bleed`: the tile fills the canvas; `padding` shrinks the art
   * toward the middle (1 = the tile edge to edge).
   */
  fit: { kind: "transparent" } | { kind: "full-bleed"; padding: number };
}

/**
 * Android crops a maskable icon to shapes as small as a circle 80% of its
 * width. At 1.25 the whole tile sits inside that circle's square, so the art
 * survives every mask.
 */
export const MASKABLE_PADDING = 1.25;

export const ICONS: readonly IconSpec[] = [
  { file: "icons/icon-192.png", size: 192, fit: { kind: "transparent" } },
  { file: "icons/icon-512.png", size: 512, fit: { kind: "transparent" } },
  {
    file: "icons/icon-maskable-512.png",
    size: 512,
    fit: { kind: "full-bleed", padding: MASKABLE_PADDING },
  },
  // iOS masks this itself; transparent corners would turn black.
  {
    file: "apple-touch-icon.png",
    size: 180,
    fit: { kind: "full-bleed", padding: 1 },
  },
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceMark {
  viewBox: Box;
  /** The first <rect>: its bounds and fill. */
  tile: Box & { fill: string };
  /** Everything inside <svg>, minus <title>. */
  inner: string;
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function num(tag: string, name: string, fallback?: number): number {
  const raw = attr(tag, name);
  const value = raw === undefined ? fallback : Number(raw);
  if (value === undefined || !Number.isFinite(value))
    throw new Error(`The source SVG's ${name}="${raw}" isn't a number`);
  return value;
}

export function parseMark(svg: string): SourceMark {
  const open = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!open) throw new Error("The source isn't an SVG");
  const box = attr(open, "viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box?.length !== 4 || box.some((n) => !Number.isFinite(n)))
    throw new Error("The source SVG needs a viewBox");
  const [x = 0, y = 0, width = 0, height = 0] = box;
  const rect = /<rect\b[^>]*>/.exec(svg)?.[0];
  const fill = rect ? attr(rect, "fill") : undefined;
  if (!rect || !fill)
    throw new Error(
      "The source SVG's first <rect> must be its tile, with a fill color",
    );
  const inner = svg
    .slice(svg.indexOf(open) + open.length, svg.lastIndexOf("</svg>"))
    .replace(/<title>[\s\S]*?<\/title>/g, "");
  return {
    viewBox: { x, y, width, height },
    tile: {
      x: num(rect, "x", 0),
      y: num(rect, "y", 0),
      width: num(rect, "width"),
      height: num(rect, "height"),
      fill,
    },
    inner,
  };
}

/** The SVG to rasterize for one icon. */
export function iconSvg(mark: SourceMark, spec: IconSpec): string {
  const { size, fit } = spec;
  if (fit.kind === "transparent") {
    const { x, y, width, height } = mark.viewBox;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${x} ${y} ${width} ${height}">${mark.inner}</svg>`;
  }
  const { tile } = mark;
  const side = Math.max(tile.width, tile.height) * fit.padding;
  const x = tile.x + tile.width / 2 - side / 2;
  const y = tile.y + tile.height / 2 - side / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${x} ${y} ${side} ${side}"><rect x="${x}" y="${y}" width="${side}" height="${side}" fill="${tile.fill}"/>${mark.inner}</svg>`;
}

export function renderPng(svg: string, size: number): Buffer {
  return Buffer.from(
    new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng(),
  );
}

function main() {
  const source = path.resolve(process.argv[2] ?? "public/favicon.svg");
  const mark = parseMark(readFileSync(source, "utf8"));
  for (const spec of ICONS) {
    const out = path.join(ROOT, "public", spec.file);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, renderPng(iconSvg(mark, spec), spec.size));
    console.log(`${path.relative(ROOT, out)}  ${spec.size}×${spec.size}`);
  }
}

if (isMain(import.meta.url)) main();
