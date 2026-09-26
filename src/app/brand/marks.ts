// The six marks (docs/DESIGN.md §7.5), as data: the owner's locked "Pixel
// star" set, plus Plan and Todo from the future-directions round. Both the <Mark> component and scripts/build-icons.ts (favicons,
// home-screen icons) draw from here, so swapping a drawing is one edit:
// replace its shapes in GLYPHS, then run `pnpm tsx scripts/build-icons.ts`.
//
// The grid: an 18-unit square with the tile at (1,1), 16×16. The glyph's live
// area is 3…15; boxes fill it, and points may overshoot it by 0.5. Every mark
// has a primary shape at 100% and a secondary at 70%. No corner radius.

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

export interface MarkShape {
  /** An SVG path on the 18-unit grid. */
  readonly d: string;
  /** 1 for the primary shape, 0.7 for the secondary. */
  readonly opacity: number;
  /**
   * Where a 70% shape overlaps the 100% one, a 0.7-unit ring of tile color
   * keeps the overlap readable.
   */
  readonly halo?: boolean;
}

/** The drawings. The umbrella uses the scheduler's. */
export const GLYPHS: Record<
  Exclude<MarkId, "umbrella">,
  readonly MarkShape[]
> = {
  // Two courses side by side, stepped 4 units in time, touching at x=9.
  schedule: [
    { d: "M3 3h6v8h-6Z", opacity: 1 },
    { d: "M9 7h6v8h-6Z", opacity: 0.7 },
  ],
  // A 5×5 pixel star (2-unit cells) and a small pixel sparkle.
  reviews: [
    {
      d: "M7 3.5h2v2h-2ZM3 5.5h2v2h-2ZM5 5.5h2v2h-2ZM7 5.5h2v2h-2ZM9 5.5h2v2h-2ZM11 5.5h2v2h-2ZM5 7.5h2v2h-2ZM7 7.5h2v2h-2ZM9 7.5h2v2h-2ZM5 9.5h2v2h-2ZM9 9.5h2v2h-2ZM3 11.5h2v2h-2ZM11 11.5h2v2h-2Z",
      opacity: 1,
    },
    {
      d: "M13.5 3h1v1h-1ZM12.5 4h1v1h-1ZM13.5 4h1v1h-1ZM14.5 4h1v1h-1ZM13.5 5h1v1h-1Z",
      opacity: 0.7,
    },
  ],
  // A bubble with a stepped pixel tail, and a reply tucked into its corner.
  chat: [
    { d: "M3 3H15V11H6V12.5H4.5V14H3Z", opacity: 1 },
    { d: "M10.5 11.5h4.5v3.5h-4.5Z", opacity: 0.7, halo: true },
  ],
  // A two-step staircase (the semesters behind you) and the next step ahead.
  // They touch at y=7 and never overlap, so no halo.
  plan: [
    { d: "M3 15V11H7V7H15V15Z", opacity: 1 },
    { d: "M11 3h4v4h-4Z", opacity: 0.7 },
  ],
  // Two list rows done, a box and a bar each, and a third still open.
  todo: [
    { d: "M3 3h3v3h-3ZM8 3h7v3h-7ZM3 7.5h3v3h-3ZM8 7.5h7v3h-7Z", opacity: 1 },
    { d: "M3 12h3v3h-3ZM8 12h7v3h-7Z", opacity: 0.7 },
  ],
};

export type MarkTheme = "light" | "dark";

/**
 * What each glyph is painted with. Paper on every product tile but Todo's:
 * paper fails 4.5:1 on any yellow lighter than 700, so Todo's yellow-400
 * tile takes an ink glyph (8.1:1). The umbrella's follows the theme.
 */
export const GLYPH_PAINT: Record<MarkId, "paper" | "ink" | "theme"> = {
  umbrella: "theme",
  schedule: "paper",
  reviews: "paper",
  chat: "paper",
  plan: "paper",
  todo: "ink",
};

/**
 * The themes in which a tile needs a 1px line to stand off the page: the
 * umbrella's paper (or dark) tile in both, and Todo's yellow in light only,
 * where the tile alone is 2.3:1 on paper (in dark it's 8.1:1).
 */
const KEYLINE: Record<MarkId, readonly MarkTheme[]> = {
  umbrella: ["light", "dark"],
  schedule: [],
  reviews: [],
  chat: [],
  plan: [],
  todo: ["light"],
};

/** Whether `id` draws its keyline in `theme`. */
export function hasKeyline(id: MarkId, theme: MarkTheme): boolean {
  return KEYLINE[id].includes(theme);
}

export function glyphOf(id: MarkId): readonly MarkShape[] {
  return GLYPHS[id === "umbrella" ? "schedule" : id];
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
  | { kind: "halo"; role: MarkRole; d: string; width: number }
  | { kind: "path"; role: MarkRole; d: string; opacity: number };

/**
 * - `page`: on a page, with its 2px offset (the default).
 * - `bleed`: an app icon; the tile is the whole icon and the OS rounds it.
 * - `maskable`: an Android adaptive icon; the glyph sits inside the 80% safe
 *   circle on a full-bleed tile.
 */
export type MarkVariant = "page" | "bleed" | "maskable";

export interface MarkDrawing {
  viewBox: string;
  layers: MarkLayer[];
}

/** 22.5 units across puts the glyph's farthest corner inside the safe circle. */
const MASKABLE_SPAN = 22.5;

/**
 * The layers of a mark drawn at `size` CSS pixels. The offset and keyline are
 * set in pixels (2px and 1px), so they're converted to grid units per size.
 * At 16px and under, 70% shapes go solid: a tint that small reads as mud.
 *
 * With a `theme`, only that theme's layers (a file has one theme). Without
 * one, a keyline only one theme draws is marked `only`, for a page that
 * switches themes with CSS.
 */
export function drawMark(
  id: MarkId,
  size: number,
  variant: MarkVariant = "page",
  theme?: MarkTheme,
): MarkDrawing {
  const small = size <= 16;
  const layers: MarkLayer[] = [];
  let viewBox = "0 0 19 19";
  if (variant === "page") {
    const offset = Math.min(Math.max((2 * 18) / size, 0.75), small ? 1 : 2);
    layers.push({
      kind: "rect",
      role: "offset",
      x: 1 + offset,
      y: 1 + offset,
      size: 16,
    });
  }
  if (variant === "maskable") {
    const start = 9 - MASKABLE_SPAN / 2;
    viewBox = `${start} ${start} ${MASKABLE_SPAN} ${MASKABLE_SPAN}`;
    layers.push({
      kind: "rect",
      role: "tile",
      x: start,
      y: start,
      size: MASKABLE_SPAN,
    });
  } else {
    if (variant === "bleed") viewBox = "1 1 16 16";
    layers.push({ kind: "rect", role: "tile", x: 1, y: 1, size: 16 });
    const themes = KEYLINE[id].filter(
      (t) => theme === undefined || t === theme,
    );
    if (themes.length > 0) {
      const width = Math.max(0.5, 18 / size);
      const [onlyIn] = themes;
      layers.push({
        kind: "outline",
        role: "keyline",
        x: 1 + width / 2,
        y: 1 + width / 2,
        size: 16 - width,
        width,
        ...(themes.length === 1 && theme === undefined ? { only: onlyIn } : {}),
      });
    }
  }
  for (const shape of glyphOf(id)) {
    if (shape.halo && !small)
      layers.push({ kind: "halo", role: "tile", d: shape.d, width: 1.4 });
    layers.push({
      kind: "path",
      role: "glyph",
      d: shape.d,
      opacity: small ? 1 : shape.opacity,
    });
  }
  return { viewBox, layers };
}

/**
 * A standalone SVG document, for files (favicons, app icons). `colors` gives
 * each role's paint: a color, or a `var(--…)` with a fallback.
 */
export function markSvg(
  id: MarkId,
  size: number,
  colors: Record<MarkRole, string>,
  {
    variant = "page",
    title,
    style,
    theme,
  }: {
    variant?: MarkVariant;
    title?: string;
    style?: string;
    theme?: MarkTheme;
  } = {},
): string {
  const { viewBox, layers } = drawMark(id, size, variant, theme);
  const body = layers.map((layer) => layerSvg(layer, colors[layer.role]));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">`,
    title ? `<title>${title}</title>` : "",
    style ? `<style>${style}</style>` : "",
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
    case "halo":
      return `<path class="${layer.role} halo" d="${layer.d}" fill="${paint}" stroke="${paint}" stroke-width="${n(layer.width)}" stroke-linejoin="miter"/>`;
    case "path":
      return `<path class="${layer.role}" d="${layer.d}" fill="${paint}"${layer.opacity < 1 ? ` opacity="${layer.opacity}"` : ""}/>`;
  }
}

/** Short numbers: 2.25, not 2.2500000000000004. */
function n(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
