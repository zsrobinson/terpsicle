import { describe, expect, it } from "vitest";
import { findImportProblems } from "./check-imports";
import { findTermIds, isExempt } from "./check-term-ids";

describe("findTermIds", () => {
  it.each(["202701", "202605", "202608", "202612"])("flags %s", (id) => {
    expect(findTermIds("src/app/x.ts", `const t = "${id}";`)).toEqual([
      `src/app/x.ts:1:12  "${id}"`,
    ]);
  });

  it("ignores numbers that aren't term ids", () => {
    expect(
      findTermIds("src/app/x.ts", "const a = 202602; const b = 2026;"),
    ).toEqual([]);
  });

  it("exempts fixtures, parser goldens and tests", () => {
    expect(isExempt("src/fixtures/terms.ts")).toBe(true);
    expect(isExempt("src/ingest/__fixtures__/soc.html")).toBe(true);
    expect(isExempt("src/core/time.test.ts")).toBe(true);
    expect(isExempt("src/core/time.ts")).toBe(false);
  });
});

describe("findImportProblems", () => {
  it("allows relative imports inside a folder and alias imports across", () => {
    const text =
      'import { a } from "./a";\nimport { b } from "../catalog/b";\nimport { c } from "~/ingest/c";';
    expect(findImportProblems("src/core/time/x.ts", text)).toEqual([]);
  });

  it("flags relative imports that cross folders", () => {
    const text = 'import { a } from "../../ingest/a";';
    expect(findImportProblems("src/core/time/x.ts", text)).toEqual([
      'src/core/time/x.ts:1:14  "../../ingest/a": crosses from src/core into src/ingest; import it as "~/ingest/…"',
    ]);
  });

  it("allows asset imports from the src root (styles)", () => {
    expect(
      findImportProblems(
        "src/routes/__root.tsx",
        'import css from "../styles.css?url";',
      ),
    ).toEqual([]);
  });

  it("flags imports from reference/", () => {
    const text = 'import { x } from "../../reference/prototype/src/core";';
    expect(findImportProblems("src/app/x.ts", text)[0]).toContain(
      "never import from reference/",
    );
  });

  it("flags clock reads in core but not in its tests", () => {
    const text =
      "const t = Date.now();\nconst d = new Date();\nconst ok = new Date(0);";
    expect(findImportProblems("src/core/x.ts", text)).toHaveLength(2);
    expect(findImportProblems("src/core/x.test.ts", text)).toEqual([]);
    expect(findImportProblems("src/server/x.ts", text)).toEqual([]);
  });
});
