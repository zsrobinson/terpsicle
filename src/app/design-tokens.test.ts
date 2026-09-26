import { describe, expect, it } from "vitest";
import { COURSE_COLORS } from "~/core/schema";
import { readTokens, type Theme } from "./brand/css-tokens";
import { GLYPH_PAINT, hasKeyline, MARK_IDS } from "./brand/marks";

// The design system as a test (docs/UX-REVIEW.md §2): every UI file uses the
// type scale, the spacing rhythm and the color tokens, so a panel built next
// month looks like the ones built this month. When this fails, use the token
// the message names; don't widen the allowlists to get green.

const SOURCES = import.meta.glob<string>(
  [
    "/src/{app,features,components,routes}/**/*.{ts,tsx}",
    "!/src/**/*.test.{ts,tsx}",
  ],
  { query: "?raw", import: "default", eager: true },
);

interface Rule {
  pattern: RegExp;
  /** Class names and colors live in components; .ts files hold logic. */
  tsxOnly?: boolean;
  allow?: (match: string) => boolean;
}

const SPACING_SCALE = new Set([
  "0",
  "0.5",
  "1",
  "1.5",
  "2",
  "3",
  "4",
  "6",
  "8",
]);
// Inside controls only: a button's or chip's sides, a menu item's check column.
const CONTROL_PADDING = /^(?:px|pl|pr)-2\.5$|^pr-7$/;
const SPACING =
  "p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y";
const PALETTE =
  "white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const RULES = {
  /** text-[12.5px]: use text-2xs … text-xl. */
  typeScale: { pattern: /\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g },
  /** mt-5, gap-2.5: use 1, 1.5, 2, 3, 4, 6 (0.5 to nudge a line). */
  spacingSteps: {
    pattern: new RegExp(
      `(?<=[\\s"'\`:])-?(?:${SPACING})-\\d+(?:\\.\\d+)?\\b(?![.\\d])`,
      "g",
    ),
    tsxOnly: true,
    allow: (m: string) => {
      const cls = m.replace(/^-/, "");
      const step = cls.split("-").pop() ?? "";
      return SPACING_SCALE.has(step) || CONTROL_PADDING.test(cls);
    },
  },
  /** gap-[3px]: arbitrary pixels skip the rhythm entirely. */
  spacingArbitrary: {
    pattern: new RegExp(`\\b(?:${SPACING})-\\[\\d+(?:\\.\\d+)?px\\]`, "g"),
    tsxOnly: true,
  },
  /** #e21833: use a token (bg-logo, text-muted, …). */
  hexColor: {
    pattern: /(?<=["'`\s(:])#(?:[0-9a-fA-F]{3}){1,2}(?:[0-9a-fA-F]{2})?\b/g,
    tsxOnly: true,
  },
  /** rgb(…), oklch(…): define it in styles.css as a token. */
  colorFunction: {
    pattern: /\b(?:rgba?|hsla?|oklch|oklab)\(/g,
    tsxOnly: true,
  },
  /** bg-red-500, text-white: Tailwind's palette isn't ours; both themes break. */
  paletteClass: {
    pattern: new RegExp(
      `\\b(?:bg|text|border|ring|fill|stroke|outline|decoration|divide|from|via|to)-(?:${PALETTE})(?:-\\d{2,3})?\\b`,
      "g",
    ),
    tsxOnly: true,
  },
} satisfies Record<string, Rule>;

/** "file:line: match" for every offending match in `sources`. */
function scan(sources: Record<string, string>, rule: Rule): string[] {
  const found: string[] = [];
  for (const [file, source] of Object.entries(sources)) {
    if (rule.tsxOnly && !file.endsWith(".tsx")) continue;
    source.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(rule.pattern)) {
        const match = m[0].trim();
        if (!rule.allow?.(match)) found.push(`${file}:${i + 1}: ${match}`);
      }
    });
  }
  return found;
}

describe("the rules", () => {
  // The rules themselves, on made-up lines: a rule that matches nothing
  // would pass forever.
  const bad = (line: string, rule: Rule) =>
    scan({ "x.tsx": line }, rule).length;

  it("catch what they're for and leave the tokens alone", () => {
    expect(bad(`className="text-[12.5px]"`, RULES.typeScale)).toBe(1);
    expect(bad(`className="text-sm text-muted"`, RULES.typeScale)).toBe(0);

    expect(bad(`className="mt-5 gap-2.5 px-7"`, RULES.spacingSteps)).toBe(3);
    expect(
      bad(
        `className="mt-0.5 gap-1.5 px-4 -ml-1 px-2.5 pr-7"`,
        RULES.spacingSteps,
      ),
    ).toBe(0);
    expect(bad(`className="gap-[3px]"`, RULES.spacingArbitrary)).toBe(1);

    expect(bad(`style={{ color: "#e21833" }}`, RULES.hexColor)).toBe(1);
    expect(bad(`href="#main" id={\`#\${id}\`}`, RULES.hexColor)).toBe(0);
    expect(
      bad(`style={{ background: "rgb(0 0 0)" }}`, RULES.colorFunction),
    ).toBe(1);
    expect(bad(`className="bg-red-500 text-white"`, RULES.paletteClass)).toBe(
      2,
    );
    expect(bad(`className="bg-error-soft text-fg"`, RULES.paletteClass)).toBe(
      0,
    );
  });
});

describe("the UI", () => {
  it("is all being scanned", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
  });

  it("sizes text only with the type scale (text-2xs … text-xl)", () => {
    expect(scan(SOURCES, RULES.typeScale)).toEqual([]);
  });

  it("spaces things on the 4px rhythm", () => {
    expect(scan(SOURCES, RULES.spacingSteps)).toEqual([]);
    expect(scan(SOURCES, RULES.spacingArbitrary)).toEqual([]);
  });

  it("colors only with tokens (bg-panel, text-muted, …), never raw values", () => {
    expect(scan(SOURCES, RULES.hexColor)).toEqual([]);
    expect(scan(SOURCES, RULES.colorFunction)).toEqual([]);
    expect(scan(SOURCES, RULES.paletteClass)).toEqual([]);
  });
});

// The palette itself (docs/DESIGN.md §7): every text color clears WCAG AA on
// every surface it sits on, in both themes, and the course colors stay
// distinguishable. Values come straight from src/styles.css.

const STYLES =
  Object.values(
    import.meta.glob<string>("/src/styles.css", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  )[0] ?? "";
const THEMES = readTokens(STYLES);
const MODES: Theme[] = ["light", "dark"];
/** The five products, in color order. */
const PRODUCTS = MARK_IDS.filter((id) => id !== "umbrella");

function hex(value: string | undefined): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(value ?? "");
  if (!m?.[1]) throw new Error(`Not a #rrggbb color: ${value}`);
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toByte = (v: number) =>
  Math.round(
    Math.min(
      1,
      Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055),
    ) * 255,
  );
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
}
function oklab(value: string): [number, number, number] {
  const [r, g, b] = hex(value).map(linear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** `color-mix(in oklab, a share%, b)`, as the calendar's ghosts use it. */
function mix(a: string, share: number, b: string): string {
  const [A, B] = [oklab(a), oklab(b)];
  const [L, x, y] = A.map((v, i) => v * share + (B[i] ?? 0) * (1 - share)) as [
    number,
    number,
    number,
  ];
  const l = (L + 0.3963377774 * x + 0.2158037573 * y) ** 3;
  const m = (L - 0.1055613458 * x - 0.0638541728 * y) ** 3;
  const s = (L - 0.0894841775 * x - 1.291485548 * y) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toByte);
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
/** `a` at `opacity` over `b`: the browser blends in sRGB. */
function over(a: string, opacity: number, b: string): string {
  const [x, y] = [hex(a), hex(b)];
  return `#${x
    .map((c, i) =>
      Math.round(c * opacity + (y[i] ?? 0) * (1 - opacity))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
function hue(value: string): number {
  const [, a, b] = oklab(value);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
}

/** "light fg on panel 4.21" for each pair under `min`. */
function lowContrast(pairs: [string, string][], min: number): string[] {
  return MODES.flatMap((mode) => {
    const t = THEMES[mode];
    return pairs.flatMap(([fg, bg]) => {
      const ratio = contrast(t[fg] ?? "", t[bg] ?? "");
      return ratio < min ? [`${mode} ${fg} on ${bg} ${ratio.toFixed(2)}`] : [];
    });
  });
}

describe("the palette", () => {
  it("is read from styles.css", () => {
    expect(THEMES.light.bg).toMatch(/^#/);
    expect(THEMES.dark.bg).not.toBe(THEMES.light.bg);
  });

  it("keeps text at 4.5:1 on every surface, in both themes", () => {
    const text = ["fg", "muted", "faint", "ok", "warn", "error"];
    const surfaces = ["bg", "panel", "raised", "hover", "accent-soft"];
    expect(
      lowContrast(
        text.flatMap((fg) => surfaces.map((bg): [string, string] => [fg, bg])),
        4.5,
      ),
    ).toEqual([]);
  });

  it("keeps status words, buttons and the shared pill readable on their fills", () => {
    expect(
      lowContrast(
        [
          ["ok", "ok-soft"],
          ["warn", "warn-soft"],
          ["error", "error-soft"],
          ["shared", "shared-soft"],
          ["accent-fg", "accent"],
          ["fg", "accent-soft"],
        ],
        4.5,
      ),
    ).toEqual([]);
  });

  it("keeps the marks' glyphs readable on their tiles, and the menu's text on product fills", () => {
    expect(
      lowContrast(
        [
          ["umbrella-glyph", "umbrella-tile"],
          ...PRODUCTS.map((p): [string, string] => [
            `product-${p}-fg`,
            `product-${p}`,
          ]),
          ...PRODUCTS.flatMap((p): [string, string][] => [
            ["fg", `product-${p}-soft`],
            ["muted", `product-${p}-soft`],
          ]),
        ],
        4.5,
      ),
    ).toEqual([]);
  });

  it("keeps a mark's 70% shape at 3:1 on its tile", () => {
    const low = MODES.flatMap((mode) => {
      const t = THEMES[mode];
      return PRODUCTS.flatMap((p) => {
        const tile = t[`product-${p}`] ?? "";
        const ratio = contrast(
          over(t[`product-${p}-fg`] ?? "", 0.7, tile),
          tile,
        );
        return ratio < 3 ? [`${mode} ${p} ${ratio.toFixed(2)}`] : [];
      });
    });
    expect(low).toEqual([]);
  });

  it("paints each glyph as marks.ts says: paper, or ink on Todo's yellow", () => {
    for (const mode of MODES) {
      const t = THEMES[mode];
      for (const p of PRODUCTS) {
        const paint = GLYPH_PAINT[p] === "ink" ? "#100f0f" : "#fffcf0";
        expect(t[`product-${p}-fg`]?.toLowerCase(), `${mode} ${p}`).toBe(paint);
      }
    }
  });

  it("gives a tile that doesn't stand off paper a keyline, in light", () => {
    // In dark, every tile sits on the base-700 offset, which carries its edge.
    const t = THEMES.light;
    for (const p of PRODUCTS) {
      const edge = contrast(t[`product-${p}`] ?? "", t.bg ?? "");
      if (edge >= 3) continue;
      expect(hasKeyline(p, "light"), `${p} tile ${edge.toFixed(2)}`).toBe(true);
      expect(
        contrast(t[`product-${p}-keyline`] ?? "", t.bg ?? ""),
      ).toBeGreaterThanOrEqual(3);
    }
    // Todo's is the one: its keyline is light-only (DESIGN.md §7.5).
    expect(hasKeyline("todo", "light")).toBe(true);
    expect(hasKeyline("todo", "dark")).toBe(false);
  });

  it("keeps product-colored words readable, and the marketing lines visible", () => {
    expect(
      lowContrast(
        PRODUCTS.flatMap((p): [string, string][] => [
          [`product-${p}-text`, "bg"],
          [`product-${p}-text`, `product-${p}-soft`],
        ]),
        4.5,
      ),
    ).toEqual([]);
    expect(
      lowContrast(
        PRODUCTS.map((p): [string, string] => [`product-${p}-line`, "bg"]),
        3,
      ),
    ).toEqual([]);
  });

  it("never lets the selected row look like an error or a hover", () => {
    for (const mode of MODES) {
      const t = THEMES[mode];
      expect(t["accent-soft"], mode).not.toBe(t["error-soft"]);
      expect(t["accent-soft"], mode).not.toBe(t.hover);
      // Neutral: no more chroma than Flexoki's grays.
      const [, a, b] = oklab(t["accent-soft"] ?? "");
      expect(Math.hypot(a, b), mode).toBeLessThan(0.02);
    }
  });

  it("draws keylines and offsets that stand off the page (3:1)", () => {
    expect(
      lowContrast(
        [
          ["keyline", "bg"],
          ["umbrella-keyline", "bg"],
        ],
        3,
      ),
    ).toEqual([]);
  });

  it("keeps calendar text readable on placed, ghost and dimmed blocks", () => {
    const low = MODES.flatMap((mode) => {
      const t = THEMES[mode];
      const page = t.bg ?? "";
      return COURSE_COLORS.flatMap((id) => {
        const fill = t[`course-${id}-bg`] ?? "";
        const fg = t[`course-${id}-fg`] ?? "";
        // src/features/calendar/tint.ts: ghosts 55% fill, dimmed 40% + muted.
        // entries.tsx draws a block's secondary lines at 70–80% opacity.
        const ghost = mix(fill, 0.55, page);
        const checks: [string, string, string][] = [
          ["placed", fg, fill],
          ["placed, 70% line", over(fg, 0.7, fill), fill],
          ["ghost", fg, ghost],
          ["ghost, 70% line", over(fg, 0.7, ghost), ghost],
          ["dimmed", t.muted ?? "", mix(fill, 0.4, page)],
        ];
        return checks.flatMap(([what, a, b]) => {
          const ratio = contrast(a, b);
          return ratio < 4.5
            ? [`${mode} ${id} ${what} ${ratio.toFixed(2)}`]
            : [];
        });
      });
    });
    expect(low).toEqual([]);
  });

  it("keeps the ten course colors at least 20° of hue apart", () => {
    const hues = COURSE_COLORS.map((id) => ({
      id,
      h: hue(THEMES.light[`course-${id}-border`] ?? ""),
    })).sort((a, b) => a.h - b.h);
    const close = hues.flatMap((c, i) => {
      const next = hues[(i + 1) % hues.length] ?? c;
      const gap = (next.h - c.h + 360) % 360;
      return gap < 20 ? [`${c.id}–${next.id} ${gap.toFixed(0)}°`] : [];
    });
    expect(close).toEqual([]);
  });
});
