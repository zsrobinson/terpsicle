import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "~/lib/products";
import { INTEGRATION_MARK_SIZE, IntegrationLabel } from "./integration-label";

// Integration icons (owner, 2026-09-29, app-wide; docs/DESIGN.md §7.9):
// wherever one product shows up in another, its mark does too, through this
// one component. The guards below read the source, so a new link into
// another product can't leave the mark off.

describe("IntegrationLabel", () => {
  it("puts the product's mark before its words, at the one size", () => {
    render(
      <a href="/reviews/cmsc351">
        <IntegrationLabel product="reviews">Reviews</IntegrationLabel>
      </a>,
    );
    const link = screen.getByRole("link", { name: "Reviews" });
    const mark = link.querySelector("svg");
    expect(mark).toHaveAttribute("data-mark", "reviews");
    expect(mark).toHaveAttribute("width", String(INTEGRATION_MARK_SIZE));
    expect(mark).toHaveAttribute("aria-hidden", "true");
    // A button's 16px icon rule leaves it alone.
    expect(mark).toHaveClass("size-5");
    expect(mark?.nextSibling?.textContent).toBe("Reviews");
  });

  it("says each product's View words when it's given none", () => {
    for (const product of PRODUCTS) {
      const { container, unmount } = render(
        <IntegrationLabel product={product.id} />,
      );
      expect(container.textContent).toBe(product.view);
      expect(container.querySelector("svg")).toHaveAttribute(
        "data-mark",
        product.id,
      );
      unmount();
    }
  });

  it("is the mark alone for a control that names itself", () => {
    render(
      <button type="button" aria-label="View chat for CMSC216">
        <IntegrationLabel product="chat" iconOnly />
      </button>,
    );
    const button = screen.getByRole("button", {
      name: "View chat for CMSC216",
    });
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).toHaveAttribute("data-mark", "chat");
    expect(button.querySelector("svg")).toHaveAttribute(
      "width",
      String(INTEGRATION_MARK_SIZE),
    );
  });
});

/** The app's source, without its tests. */
const SOURCES = import.meta.glob<string>(
  ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"],
  { query: "?raw", import: "default", eager: true },
);

/** Code without its comments, which may name links freely. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const KIT = "/src/components/brand/integration-label.tsx";

describe("links into other products", () => {
  it("finds the files they guard", () => {
    expect(Object.keys(SOURCES)).toContain(KIT);
    expect(Object.keys(SOURCES)).toContain("/src/features/todo/sidebar.tsx");
  });

  it("say their View words only through IntegrationLabel", () => {
    // Home's sections already wear the mark in their titles (the one
    // exception); cross-link.ts and products.ts hold the words. The
    // marketing page is the brand at full volume (DESIGN.md §8), and the
    // site's pages (`/privacy`, not found) aren't a product.
    const allowed = (path: string) =>
      path === KIT ||
      path === "/src/features/home/section.tsx" ||
      path === "/src/lib/cross-link.ts" ||
      path === "/src/lib/products.ts" ||
      path.startsWith("/src/features/marketing/") ||
      path.startsWith("/src/features/site/");
    const words = PRODUCTS.map((p) => p.view).join("|");
    // The words as a whole label: JSX text, or a string that is exactly them.
    const label = new RegExp(`(>\\s*|["'\`])(${words})(\\s*<|["'\`])`);
    const loose = Object.entries(SOURCES)
      .filter(([path]) => !allowed(path))
      .filter(
        ([, text]) =>
          /\bviewWords\(/.test(code(text)) || label.test(code(text)),
      )
      .map(([path]) => path);
    expect(loose).toEqual([]);
  });

  it("wear the product's mark wherever a cross-product click is counted", () => {
    const bare = Object.entries(SOURCES)
      .filter(([path]) => path !== "/src/lib/cross-link.ts")
      .filter(([, text]) => /\bcrossLinkClicked\(/.test(code(text)))
      .filter(([, text]) => !/<IntegrationLabel\b/.test(code(text)))
      .map(([path]) => path);
    expect(bare).toEqual([]);
  });

  it("draw a product's small mark only through IntegrationLabel", () => {
    // A feature's own `Mark`s are its 40px heroes (an empty state, a first
    // visit); a mark beside words is an integration, at its one size.
    const hand = Object.entries(SOURCES)
      .filter(([path]) => path.startsWith("/src/features/"))
      .filter(([path]) => !path.startsWith("/src/features/marketing/"))
      .flatMap(([path, text]) =>
        [...code(text).matchAll(/<Mark\b[^>]*?size=\{(\d+)\}/g)]
          .filter((m) => m[1] !== "40")
          .map((m) => `${path}: ${m[0].replace(/\s+/g, " ")}`),
      );
    expect(hand).toEqual([]);
  });
});
