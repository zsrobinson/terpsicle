// Terms are data, not config (BUILD.md §2): no term id may appear in src/
// outside fixtures and tests. A new semester must need no code change.
import {
  isMain,
  isTestFile,
  position,
  report,
  sourceFiles,
} from "./lib/source-files";

/** Testudo term ids: YYYY + 01 (spring), 05 (summer), 08 (fall), 12 (winter). */
export const TERM_ID = /20[0-9]{2}0[158]|20[0-9]{2}12/g;

export function isExempt(rel: string): boolean {
  return (
    rel.startsWith("src/fixtures/") ||
    rel.includes("/__fixtures__/") ||
    isTestFile(rel)
  );
}

export function findTermIds(rel: string, text: string): string[] {
  return [...text.matchAll(TERM_ID)].map((match) => {
    const { line, column } = position(text, match.index);
    return `${rel}:${line}:${column}  "${match[0]}"`;
  });
}

if (isMain(import.meta.url)) {
  const problems = sourceFiles((rel) => !isExempt(rel)).flatMap((file) =>
    findTermIds(file.rel, file.text),
  );
  report(
    "term ids",
    problems,
    "Term ids come from catalog/terms.json at runtime. Move examples into src/fixtures or a test.",
  );
}
