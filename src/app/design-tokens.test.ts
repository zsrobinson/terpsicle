import { describe, expect, it } from "vitest";

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
