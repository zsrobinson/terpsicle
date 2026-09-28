// The six marks (docs/DESIGN.md §7.5), as data: the owner's pixel drawings
// (2026-09-28), each a 9×9 tile. Both the <Mark> component and
// scripts/build-icons.ts (favicons, home-screen icons) draw from here, so
// redrawing a mark is one edit: change its rows in PIXELS, then run
// `pnpm tsx scripts/build-icons.ts`.
//
// The grid: the tile is 9 units square at (0,0). On a page it sits on a
// 1-unit offset down and to the right, so a page mark is 10 units across and
// is crisp at 20, 30 or 40px. The glyph is white at 100% and at 50%. No
// corner radius, no anti-aliasing: every edge is on the grid.

/** The umbrella, then the products in color order: red to yellow. */
export const MARK_IDS = [
  "umbrella",
  "schedule",
  "reviews",
  "chat",
  "plan",
  "todo",
] as const;
export type MarkId = (typeof MARK_IDS)[number];

/** What a layer is painted with; the component and the script pick colors. */
export type MarkRole = "tile" | "glyph" | "keyline" | "offset";

/** The tile's side, in grid units. */
export const TILE = 9;

/**
 * The drawings, row by row, exactly as the owner's export has them:
 * `.` the tile, `#` the glyph, `+` the glyph at 50%.
 */
export const PIXELS: Record<MarkId, readonly string[]> = {
  // An umbrella: the canopy at 50%, its rim and handle at 100%.
  umbrella: [
    ".........",
    "...+++...",
    "..+++++..",
    "..+++++..",
    "..+++++..",
    "..#####..",
    "....#....",
    "....#....",
    ".........",
  ],
  // Two courses side by side, the second later in the day.
  schedule: [
    ".........",
    ".####....",
    ".####....",
    ".####+++.",
    ".####+++.",
    ".####+++.",
    "....++++.",
    "....++++.",
    ".........",
  ],
  // A quill, writing.
  reviews: [
    ".........",
    ".....++..",
    "...###.+.",
    "..#####+.",
    "..####+..",
    ".+###+#..",
    ".+.#+#...",
    "..++.....",
    ".........",
  ],
  // A speech bubble with two lines of text and a tail.
  chat: [
    ".........",
    ".#######.",
    ".#+++++#.",
    ".#######.",
    ".#+++++#.",
    ".#######.",
    ".##......",
    ".#.......",
    ".........",
  ],
  // Stacked semesters: one on top, two below.
  plan: [
    ".........",
    "....####.",
    "....#++#.",
    "....#++#.",
    ".#######.",
    ".#++#++#.",
    ".#++#++#.",
    ".#######.",
    ".........",
  ],
  // A checklist of three rows, each with its box.
  todo: [
    ".........",
    ".#######.",
    ".#+#...#.",
    ".#######.",
    ".#+#...#.",
    ".#######.",
    ".#+#...#.",
    ".#######.",
    ".........",
  ],
};

/** A glyph's two tones: `#` at 100%, `+` at 50%. */
const TONES = [
  { char: "#", opacity: 1 },
  { char: "+", opacity: 0.5 },
] as const;

export type MarkTheme = "light" | "dark";

/**
 * The themes in which a tile needs a 1px line to stand off the page. Only
 * the umbrella's black tile, and only in dark, where the page is black too.
 * Every product tile clears 3:1 on paper, and in dark sits on its offset.
 */
const KEYLINE: Record<MarkId, readonly MarkTheme[]> = {
  umbrella: ["dark"],
  schedule: [],
  reviews: [],
  chat: [],
  plan: [],
  todo: [],
};

/** Whether `id` draws its keyline in `theme`. */
export function hasKeyline(id: MarkId, theme: MarkTheme): boolean {
  return KEYLINE[id].includes(theme);
}

/**
 * One tone of a glyph as a path: each row's runs of `char` as rectangles,
 * on the tile's grid.
 */
export function glyphPath(id: MarkId, char: "#" | "+"): string {
  const parts: string[] = [];
  PIXELS[id].forEach((row, y) => {
    for (const run of row.matchAll(new RegExp(`\\${char}+`, "g")))
      parts.push(`M${run.index} ${y}h${run[0].length}v1h-${run[0].length}Z`);
  });
  return parts.join("");
}

export type MarkLayer =
  | { kind: "rect"; role: MarkRole; x: number; y: number; size: number }
  | {
      kind: "outline";
      role: MarkRole;
      x: number;
      y: number;
      size: number;
      width: number;
      /** Drawn only in this theme; in both when absent. */
      only?: MarkTheme;
    }
  | { kind: "path"; role: MarkRole; d: string; opacity: number };

/**
 * - `page`: on a page, on its 1-unit offset (the default).
 * - `bleed`: an app icon or favicon; the tile is the whole icon, no offset
 *   (the OS rounds it).
 * - `maskable`: an Android adaptive icon; the glyph sits inside the 80% safe
 *   circle on a full-bleed tile.
 */
export type MarkVariant = "page" | "bleed" | "maskable";

export interface MarkDrawing {
  viewBox: string;
  layers: MarkLayer[];
}

/** How many units across a full-bleed icon shows. */
const SPAN: Record<Exclude<MarkVariant, "page">, number> = {
  bleed: TILE,
  // 11 units puts the glyph's farthest corner (4.3 units out) inside the
  // safe circle (radius 40%, 4.4 units).
  maskable: 11,
};

/**
 * The layers of a mark drawn at `size` CSS pixels.
 *
 * - `theme`: only that theme's layers (a file has one theme). Without one,
 *   a keyline only one theme draws is marked `only`, for a page that
 *   switches themes with CSS.
 * - `solid`: both tones at 100%, for a silhouette (the notification badge,
 *   where only the alpha counts).
 *
 * A full-bleed icon's glyph lands on whole pixels: the tile's grid is scaled
 * by a whole number and centered, and the tile fills what's left over.
 */
export function drawMark(
  id: MarkId,
  size: number,
  {
    variant = "page",
    theme,
    solid = false,
  }: { variant?: MarkVariant; theme?: MarkTheme; solid?: boolean } = {},
): MarkDrawing {
  const layers: MarkLayer[] = [];
  let viewBox: string;
  if (variant === "page") {
    viewBox = `0 0 ${TILE + 1} ${TILE + 1}`;
    layers.push({ kind: "rect", role: "offset", x: 1, y: 1, size: TILE });
    layers.push({ kind: "rect", role: "tile", x: 0, y: 0, size: TILE });
    const themes = KEYLINE[id].filter(
      (t) => theme === undefined || t === theme,
    );
    if (themes.length > 0) {
      // 1px, whatever the size.
      const width = (TILE + 1) / size;
      const [onlyIn] = themes;
      layers.push({
        kind: "outline",
        role: "keyline",
        x: width / 2,
        y: width / 2,
        size: TILE - width,
        width,
        ...(themes.length === 1 && theme === undefined ? { only: onlyIn } : {}),
      });
    }
  } else {
    const span = SPAN[variant];
    // Pixels per unit: a whole number where the icon is big enough.
    const unit = size >= span ? Math.floor(size / span) : size / span;
    const across = size / unit;
    const start = -Math.floor((size - TILE * unit) / 2) / unit;
    viewBox = `${n(start)} ${n(start)} ${n(across)} ${n(across)}`;
    layers.push({
      kind: "rect",
      role: "tile",
      x: start,
      y: start,
      size: across,
    });
  }
  for (const tone of TONES) {
    const d = glyphPath(id, tone.char);
    if (d)
      layers.push({
        kind: "path",
        role: "glyph",
        d,
        opacity: solid ? 1 : tone.opacity,
      });
  }
  return { viewBox, layers };
}

/**
 * A standalone SVG document, for files (favicons, app icons, the link
 * preview). `colors` gives each role's paint.
 */
export function markSvg(
  id: MarkId,
  size: number,
  colors: Record<MarkRole, string>,
  {
    variant = "page",
    title,
    theme,
    solid,
  }: {
    variant?: MarkVariant;
    title?: string;
    theme?: MarkTheme;
    solid?: boolean;
  } = {},
): string {
  const { viewBox, layers } = drawMark(id, size, { variant, theme, solid });
  const body = layers.map((layer) => layerSvg(layer, colors[layer.role]));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" shape-rendering="crispEdges">`,
    title ? `<title>${title}</title>` : "",
    ...body,
    "</svg>",
  ].join("");
}

function layerSvg(layer: MarkLayer, paint: string): string {
  switch (layer.kind) {
    case "rect":
      return `<rect class="${layer.role}" x="${n(layer.x)}" y="${n(layer.y)}" width="${n(layer.size)}" height="${n(layer.size)}" fill="${paint}"/>`;
    case "outline":
      return `<rect class="${layer.role}" x="${n(layer.x)}" y="${n(layer.y)}" width="${n(layer.size)}" height="${n(layer.size)}" fill="none" stroke="${paint}" stroke-width="${n(layer.width)}"/>`;
    case "path":
      return `<path class="${layer.role}" d="${layer.d}" fill="${paint}"${layer.opacity < 1 ? ` opacity="${layer.opacity}"` : ""}/>`;
  }
}

/** Short numbers, but exact enough to keep a 512px icon on whole pixels. */
function n(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}
