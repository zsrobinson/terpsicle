import { describe, expect, it } from "vitest";

// Menus on a phone are sheets (docs/decisions.md, "Base UI for every
// primitive, styled in Ink", and "Menus are ActionMenus"): feature code
// builds every menu from the kit's ActionMenu (a button's menu) and
// ActionContextMenu (a row's right-click and long-press menu), which are a
// menu from `md` up and a sheet below. A raw dropdown or context menu would
// be a small desktop popup under a finger. The guards read the source, as
// brand/integration-label.test.tsx's do.

/** The app's source, without its tests. */
const SOURCES = import.meta.glob<string>(
  ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"],
  { query: "?raw", import: "default", eager: true },
);

/** Code without its comments, which may name the modules freely. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** An import of a menu that's the same popup at every width. */
const RAW_MENU =
  /from\s+["'](?:[^"']*\/)?(?:dropdown-menu|context-menu)["']|from\s+["']@base-ui\/react(?:\/(?:menu|context-menu|menubar))?["']/;

const ACTION_MENU = "/src/components/ui/action-menu.tsx";
const DROPDOWN_MENU = "/src/components/ui/dropdown-menu.tsx";

/**
 * Reviews may move to PlanetTerp (the owner is deciding, 2026-10-04), so its
 * "Write a review" menu stays the kit's DropdownMenu until that's settled.
 */
const FROZEN = "/src/features/reviews/";

describe("menus", () => {
  it("finds the files they guard", () => {
    expect(Object.keys(SOURCES)).toContain(ACTION_MENU);
    expect(Object.keys(SOURCES)).toContain(
      "/src/features/chat/message-row.tsx",
    );
    // The pattern catches each way of reaching a raw menu.
    for (const line of [
      'import { DropdownMenu } from "~/ui/dropdown-menu";',
      'import { DropdownMenu } from "./dropdown-menu";',
      'import { Menu } from "@base-ui/react/menu";',
      'import { ContextMenu } from "@base-ui/react/context-menu";',
      'import { Menu } from "@base-ui/react";',
    ])
      expect(line).toMatch(RAW_MENU);
    expect('import { ActionMenu } from "~/ui/action-menu";').not.toMatch(
      RAW_MENU,
    );
  });

  it("are ActionMenus everywhere but the kit's own two", () => {
    const raw = Object.entries(SOURCES)
      .filter(([path]) => path !== ACTION_MENU && path !== DROPDOWN_MENU)
      .filter(([path]) => !path.startsWith(FROZEN))
      .filter(([, text]) => RAW_MENU.test(code(text)))
      .map(([path]) => path);
    expect(raw).toEqual([]);
  });
});
