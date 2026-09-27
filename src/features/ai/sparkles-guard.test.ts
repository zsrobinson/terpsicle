import { describe, expect, it } from "vitest";

// The sparkles mark what a model wrote, and a student can turn AI features
// off (docs/decisions.md, "AI features can be turned off"). So the sparkles
// icon is drawn in one place, `AiSparkles`, which shows only behind
// `useAiFeatures`, and a sparkles feature gates its words with the same hook.
// When this fails, use `AiSparkles` and `useAiFeatures` from ~/features/ai;
// don't widen the allowlist to get green.

const SOURCES = import.meta.glob<string>(
  ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"],
  { query: "?raw", import: "default", eager: true },
);

/** Files that may import lucide's sparkles, and why. */
const ALLOWED: Record<string, string> = {
  "/src/features/ai/ai-sparkles.tsx": "the one gated icon",
  "/src/features/admin/feedback-page.tsx":
    "the owner's feedback groups: an admin tool, not what students see",
  "/src/features/admin/kit-page.tsx":
    "the kit's specimen of the summary card, admins only",
};

/** Any lucide sparkles icon, however it's imported or renamed. */
const SPARKLES_IMPORT =
  /import\s*\{[^}]*\b(Sparkles|SparklesIcon|Sparkle|WandSparkles)\b[^}]*\}\s*from\s*["']lucide-react["']/;

describe("the sparkles", () => {
  it("are drawn only by AiSparkles, behind useAiFeatures", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path, text]) => !ALLOWED[path] && SPARKLES_IMPORT.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("gate everything that draws them with useAiFeatures", () => {
    const ungated = Object.entries(SOURCES)
      .filter(
        ([path, text]) =>
          path !== "/src/features/ai/ai-sparkles.tsx" &&
          /<AiSparkles\b/.test(text) &&
          !/\buseAiFeatures\(/.test(text),
      )
      .map(([path]) => path);
    expect(ungated).toEqual([]);
  });

  it("finds the files it guards", () => {
    // A glob that matched nothing would pass the checks above.
    expect(SOURCES["/src/features/ai/ai-sparkles.tsx"]).toMatch(
      /useAiFeatures\(/,
    );
    for (const path of Object.keys(ALLOWED))
      expect(SOURCES[path], path).toBeDefined();
  });
});
