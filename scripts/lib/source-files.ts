import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const SRC = path.join(ROOT, "src");

const SKIP_DIRS = new Set(["node_modules", ".wrangler", "dist"]);

export interface SourceFile {
  /** Path relative to the repo root, with forward slashes. */
  rel: string;
  abs: string;
  text: string;
}

/** Every file under src/ whose name passes `filter`, sorted by path. */
export function sourceFiles(filter: (rel: string) => boolean): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else {
        const rel = path.relative(ROOT, abs).split(path.sep).join("/");
        if (filter(rel))
          files.push({ rel, abs, text: readFileSync(abs, "utf8") });
      }
    }
  };
  walk(SRC);
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

export function isTestFile(rel: string): boolean {
  return /\.test\.tsx?$/.test(rel);
}

/** 1-based line and column of a string index. */
export function position(text: string, index: number) {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  return { line, column: index - before.lastIndexOf("\n") };
}

/** Prints `problems` and exits non-zero if there are any. */
export function report(check: string, problems: string[], hint: string) {
  if (problems.length === 0) {
    console.log(`${check}: ok`);
    return;
  }
  console.error(`${check}: ${problems.length} problem(s)\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${hint}`);
  process.exitCode = 1;
}

export function isMain(importMetaUrl: string): boolean {
  return (
    process.argv[1] !== undefined &&
    path.resolve(process.argv[1]) === fileURLToPath(importMetaUrl)
  );
}
