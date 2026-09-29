import { describe, expect, it } from "vitest";

// The sparkles mark what a model wrote. Students see none: Reviews' AI
// summaries, the only AI feature they had, were removed (owner, 2026-09-29,
// docs/decisions.md "No AI features in Reviews"). The owner's admin tools
// still group feedback with a model and mark it so. When this fails, don't
// widen the allowlist to get green: an AI feature for students needs the
// owner's call first.

const SOURCES = import.meta.glob<string>(
  ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"],
  { query: "?raw", import: "default", eager: true },
);

/** Files that may import lucide's sparkles, and why. */
const ALLOWED: Record<string, string> = {
  "/src/features/admin/feedback-page.tsx":
    "the owner's feedback groups: an admin tool, not what students see",
};

/** Any lucide sparkles icon, however it's imported or renamed. */
const SPARKLES_IMPORT =
  /import\s*\{[^}]*\b(Sparkles|SparklesIcon|Sparkle|WandSparkles)\b[^}]*\}\s*from\s*["']lucide-react["']/;

describe("the sparkles", () => {
  it("are drawn only in the owner's admin tools", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path, text]) => !ALLOWED[path] && SPARKLES_IMPORT.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("finds the files it guards", () => {
    // A glob that matched nothing would pass the check above.
    for (const path of Object.keys(ALLOWED))
      expect(SOURCES[path], path).toBeDefined();
  });
});
