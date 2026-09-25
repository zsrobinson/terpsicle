// The half of the import boundaries (BUILD.md §3) Biome can't see, because
// it doesn't resolve relative paths:
// - a relative import must stay inside its top-level src folder, so every
//   cross-folder import is a `~/` alias, which biome.jsonc checks per folder;
// - nothing imports from reference/ (CLAUDE.md);
// - src/core never reads the clock: time comes in as an argument (CLAUDE.md).
import path from "node:path";
import {
  isMain,
  isTestFile,
  position,
  ROOT,
  report,
  SRC,
  sourceFiles,
} from "./lib/source-files";

const CODE = /\.(ts|tsx)$/;
// `from "x"`, `import "x"`, `import("x")`, `export … from "x"`.
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"'\n]+)["']/g;
const CLOCK = /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)/g;

/** `core`, `app`, … or `(root)` for files directly in src/. */
export function topFolder(absPath: string): string | null {
  const rel = path.relative(SRC, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const [first, ...rest] = rel.split(path.sep);
  return rest.length === 0 ? "(root)" : (first ?? null);
}

function isCommented(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const trimmed = text.slice(lineStart, index).trimStart();
  return trimmed.startsWith("//") || trimmed.startsWith("*");
}

export function findImportProblems(rel: string, text: string): string[] {
  const abs = path.join(ROOT, rel);
  const from = topFolder(abs);
  const problems: string[] = [];
  const at = (index: number) => {
    const { line, column } = position(text, index);
    return `${rel}:${line}:${column}`;
  };

  for (const match of text.matchAll(SPECIFIER)) {
    const spec = match[1] ?? "";
    if (isCommented(text, match.index)) continue;
    if (/(^|\/)reference\//.test(spec)) {
      problems.push(
        `${at(match.index)}  "${spec}": never import from reference/ (read-only design reference)`,
      );
      continue;
    }
    if (!spec.startsWith(".")) continue;
    const target = path.resolve(path.dirname(abs), spec.split("?")[0] ?? spec);
    const to = topFolder(target);
    if (to === null) {
      problems.push(
        `${at(match.index)}  "${spec}": relative import leaves src/`,
      );
    } else if (to !== from && (CODE.test(target) || !path.extname(target))) {
      problems.push(
        `${at(match.index)}  "${spec}": crosses from src/${from} into src/${to}; import it as "~/${to === "components" ? "ui" : to}/…"`,
      );
    }
  }

  if (from === "core" && !isTestFile(rel)) {
    for (const match of text.matchAll(CLOCK)) {
      if (isCommented(text, match.index)) continue;
      problems.push(
        `${at(match.index)}  "${match[0]}": src/core takes the time as an argument, never reads the clock`,
      );
    }
  }
  return problems;
}

if (isMain(import.meta.url)) {
  const problems = sourceFiles(
    (rel) => CODE.test(rel) && !rel.endsWith(".gen.ts"),
  ).flatMap((file) => findImportProblems(file.rel, file.text));
  report(
    "import boundaries",
    problems,
    "See the boundary table in docs/BUILD.md §3. Package and alias rules are in biome.jsonc.",
  );
}
