import { describe, expect, it } from "vitest";

// Every link into another product wears that product's mark (owner,
// 2026-09-29, app-wide). `ViewWords` draws the mark and the words together,
// so the words are only ever written there, and on Home, whose sections
// already carry each product's mark in their titles.

const SOURCES = import.meta.glob<string>(
  ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"],
  { query: "?raw", import: "default", eager: true },
);

const ALLOWED = new Set([
  "/src/components/brand/view-words.tsx",
  "/src/features/home/section.tsx",
  "/src/lib/cross-link.ts",
]);

describe("links into other products", () => {
  it("say where they go with ViewWords, mark and all", () => {
    const loose = Object.entries(SOURCES)
      .filter(([, text]) => /\bviewWords\(/.test(text))
      .map(([path]) => path)
      .filter((path) => !ALLOWED.has(path));
    expect(loose).toEqual([]);
  });

  it("finds the files it guards", () => {
    expect(Object.keys(SOURCES)).toContain(
      "/src/components/brand/view-words.tsx",
    );
  });
});
