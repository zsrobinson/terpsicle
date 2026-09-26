import { describe, expect, it } from "vitest";
import {
  buildInlineScripts,
  cspHash,
  INLINE_SCRIPTS_SOURCE,
  loadInlineScriptSources,
} from "./inline-scripts";
import { isTestFile, ROOT, sourceFiles } from "./lib/source-files";

describe("cspHash", () => {
  it("is the CSP's sha256 source for the exact text", () => {
    // SHA-256 of the empty string, base64.
    expect(cspHash("")).toBe(
      "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
    );
    expect(cspHash("a")).not.toBe(cspHash("a "));
  });
});

describe("buildInlineScripts", () => {
  it("minifies each script and hashes the result", async () => {
    const { scripts, hashes } = await buildInlineScripts({
      one: "(function (key) {\n  // a comment\n  window[key] = 1;\n})('k');",
    });
    expect(scripts.one).toBe("(function(e){window[e]=1})(`k`);");
    expect(hashes).toEqual([cspHash(scripts.one ?? "")]);
  });

  it("lists a hash once when two scripts are the same", async () => {
    const { hashes } = await buildInlineScripts({ a: "f();", b: "f();" });
    expect(hashes).toHaveLength(1);
  });

  it("refuses what can't be an inline script", async () => {
    await expect(buildInlineScripts({ empty: " " })).rejects.toThrow(
      'Inline script "empty" has no text.',
    );
    await expect(buildInlineScripts({ bad: "let = ;" })).rejects.toThrow(
      /Inline script "bad"/,
    );
  });

  it("never ends the <script> early", async () => {
    // The minifier escapes it; the build also checks, in case one doesn't.
    const { scripts } = await buildInlineScripts({ s: "x = '</script>';" });
    expect(scripts.s).not.toMatch(/<\/script/i);
  });
});

describe(INLINE_SCRIPTS_SOURCE, () => {
  it("builds, and every file it reads is watched", async () => {
    const { sources, dependencies } = await loadInlineScriptSources(ROOT);
    const { scripts, hashes } = await buildInlineScripts(sources);
    expect(Object.keys(scripts)).toEqual(
      expect.arrayContaining(["theme", "sidebarWidth", "loadRecovery"]),
    );
    expect(hashes).toHaveLength(Object.keys(scripts).length);
    expect(dependencies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/src\/app\/inline-scripts\.ts$/),
        expect.stringMatching(/src\/app\/theme\.ts$/),
      ]),
    );
  }, 30_000);
});

describe("inline scripts in src/", () => {
  // Any other inline script would carry text the CSP has no hash for.
  it("render only through InlineScript or INLINE_SCRIPTS", () => {
    const problems: string[] = [];
    for (const { rel, text } of sourceFiles(
      (f) => /\.tsx?$/.test(f) && !isTestFile(f),
    )) {
      if (rel === "src/app/inline-script.tsx") continue;
      if (/<script[^>]*dangerouslySetInnerHTML/.test(text))
        problems.push(`${rel}: <script dangerouslySetInnerHTML>`);
      // A route's head() script: `scripts: [{ children: … }]`.
      for (const match of text.matchAll(
        /scripts:\s*\[[^\]]*children:\s*([\w.]+)/g,
      ))
        if (!match[1]?.startsWith("INLINE_SCRIPTS."))
          problems.push(`${rel}: head() script with children ${match[1]}`);
    }
    expect(problems).toEqual([]);
  });
});
