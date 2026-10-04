import { describe, expect, it } from "vitest";

// Every kit primitive is Base UI, called in Base UI's own words
// (docs/decisions.md, "Base UI for every primitive, styled in Ink"). The
// Radix compatibility shim that carried the old words through the move is
// gone; these guards keep Radix's habits from coming back: `asChild`
// (Base UI's is `render`), `data-state` on a popup's trigger (Base UI sets
// `aria-expanded`, and `data-popup-open`, which a tooltip on the same
// trigger sets too), Radix's wrapper attribute and CSS variables (the kit
// marks a floating layer `data-floating`; Base UI's is `--available-height`),
// and Radix or vaul as dependencies. The guards read the source, as
// menus.test.ts's do.

/** The app's source and e2e specs, tests included, but not this file. */
const SOURCES = import.meta.glob<string>(
  [
    "/src/**/*.{ts,tsx,css}",
    "/e2e/**/*.ts",
    "!/src/components/ui/base-ui.test.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

const PACKAGE = import.meta.glob<string>("/package.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Code without its comments, which may name Radix freely. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const RADIX_HABITS: [string, RegExp][] = [
  ["asChild (use render)", /\basChild\b/],
  ["the radix-compat shim", /radix-compat/],
  [
    "a Radix or vaul import",
    /from\s+["'](?:@radix-ui\/[^"']+|radix-ui|vaul)["']/,
  ],
  ["Radix's wrapper attribute (use data-floating)", /data-radix-/],
  ["a Radix CSS variable (use Base UI's)", /--radix-/],
  [
    "data-state on a popup trigger (use aria-expanded)",
    /data-\[state=(?:open|closed)\]|\[data-state=["']?(?:open|closed)|data-state=\{[^}]*["'](?:open|closed)["']/,
  ],
];

describe("Base UI, in its own words", () => {
  it("finds the files it guards, and each habit's pattern catches it", () => {
    expect(Object.keys(SOURCES)).toContain("/src/components/ui/popover.tsx");
    expect(Object.keys(SOURCES)).toContain("/e2e/axe.ts");
    const samples = [
      "<PopoverTrigger asChild>",
      'import { asChildRender } from "./radix-compat";',
      'import * as Popover from "@radix-ui/react-popover";',
      'import { Drawer } from "vaul";',
      'to.closest("[data-radix-popper-content-wrapper]")',
      'className="max-h-(--radix-popover-content-available-height)"',
      '"hover:bg-hover data-[state=open]:bg-hover"',
      '"has-[button[data-state=open]]:bg-hover"',
      'data-state={open ? "open" : "closed"}',
    ];
    for (const sample of samples)
      expect(RADIX_HABITS.some(([, pattern]) => pattern.test(sample))).toBe(
        true,
      );
    // The kit's own row states stay theirs.
    for (const fine of [
      "data-state={state}",
      '[data-state="previewed"]',
      'toHaveAttribute("data-state", "current")',
    ])
      expect(RADIX_HABITS.some(([, pattern]) => pattern.test(fine))).toBe(
        false,
      );
  });

  it("has no Radix habits left in the app or its specs", () => {
    const found = Object.entries(SOURCES).flatMap(([path, text]) =>
      RADIX_HABITS.filter(([, pattern]) => pattern.test(code(text))).map(
        ([habit]) => `${path}: ${habit}`,
      ),
    );
    expect(found).toEqual([]);
  });

  it("depends on neither Radix nor vaul", () => {
    const text = Object.values(PACKAGE)[0];
    expect(text).toBeDefined();
    const pkg = JSON.parse(text ?? "{}") as Record<
      string,
      Record<string, string> | undefined
    >;
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(
      names.filter((name) => /^(?:@radix-ui\/|radix-ui$|vaul$)/.test(name)),
    ).toEqual([]);
  });
});
