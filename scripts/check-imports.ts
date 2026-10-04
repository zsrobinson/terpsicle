// The half of the import boundaries (BUILD.md §3) Biome can't see, because
// it doesn't resolve relative paths:
// - a relative import must stay inside its top-level src folder, so every
//   cross-folder import is a `~/` alias, which biome.jsonc checks per folder;
// - nothing imports from reference/ (CLAUDE.md);
// - src/core never reads the clock: time comes in as an argument (CLAUDE.md);
// - only src/server/todo/crypto.ts and fetch.ts touch the sealed ELMS feed
//   link: its `url_enc` column and `openFeedLink` (docs/V3.md §5.1);
// - only the files SEALED_TABLES lists name the tables holding what an
//   account's key sealed (`sync_docs`, `todo_tasks`) or the keys themselves
//   (`user_keys`), so every read goes through the code that opens them
//   (docs/DATA.md §7.7);
// - only the kit (src/components/ui) imports the haptic trick: controls
//   tick through their `haptic` prop, never feature code (docs/decisions.md,
//   "Haptics live in the kit");
// - no module of ours is imported only for what it does on import: the
//   browser's build treats every module under src/ as free of side effects,
//   so it would leave one out in production, though dev (which doesn't
//   tree-shake) runs it (docs/decisions.md, "Our modules have no side effects
//   on import"). Stylesheets and packages are fine; tests may.
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
/** `import "x";`: an import with no bindings, run for its effect alone. */
const BARE_IMPORT = /^[ \t]*import\s*["']([^"'\n]+)["']/gm;
const CLOCK = /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)/g;
const FEED_LINK = /\burl_enc\b|\bopenFeedLink\b/g;
/** The files that may read, write or open the sealed feed link. */
export const FEED_LINK_FILES: readonly string[] = [
  "src/server/todo/crypto.ts",
  "src/server/todo/fetch.ts",
];

/**
 * Tables holding what an account's key sealed, or the keys themselves, and
 * the only files that may name them (docs/DATA.md §7.7). Everyone else reads
 * synced docs through src/server/sync/store.ts, which opens every body.
 * purge.ts only deletes their rows.
 */
export const SEALED_TABLES: readonly {
  pattern: RegExp;
  files: readonly string[];
  use: string;
}[] = [
  {
    pattern: /\bsync_docs\b/g,
    files: ["src/server/sync/store.ts", "src/server/auth/purge.ts"],
    use: "read synced docs through src/server/sync/store.ts, which opens their sealed bodies",
  },
  {
    pattern: /\buser_keys\b|\bwrapped_key\b/g,
    files: ["src/server/security/user-keys.ts", "src/server/auth/purge.ts"],
    use: "get an account's key from src/server/security/user-keys.ts",
  },
  {
    // The due-tomorrow job selects tasks by date only; testing.ts (worker
    // tests' helpers) only empties the table.
    pattern: /\btodo_tasks\b/g,
    files: [
      "src/server/todo/store.ts",
      "src/server/todo/due-tomorrow.ts",
      "src/server/todo/testing.ts",
      "src/server/auth/purge.ts",
    ],
    use: "read own tasks through src/server/todo/store.ts, which opens their sealed titles",
  },
];

/** The folder whose files may import {@link HAPTIC_MODULE}. */
export const HAPTIC_FOLDER = "src/components/ui";
/** The haptic trick, as a repo path without its extension. */
export const HAPTIC_MODULE = `${HAPTIC_FOLDER}/haptic`;

/**
 * The repo path, without a .ts or .tsx extension, that `spec` names from
 * `rel`: a relative path, or a `~/ui/` alias. Null for anything else.
 */
export function importedPath(rel: string, spec: string): string | null {
  const bare = spec.split("?")[0] ?? spec;
  const target = bare.startsWith("~/ui/")
    ? `${HAPTIC_FOLDER}/${bare.slice("~/ui/".length)}`
    : bare.startsWith(".")
      ? path.posix.join(path.posix.dirname(rel), bare)
      : null;
  return target?.replace(/\.tsx?$/, "") ?? null;
}

/** `core`, `lib`, … or `(root)` for files directly in src/. */
export function topFolder(absPath: string): string | null {
  const rel = path.relative(SRC, absPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const [first, ...rest] = rel.split(path.sep);
  return rest.length === 0 ? "(root)" : (first ?? null);
}

/** A file's folder alias: the page kit is `~/ui`, the rest `~/<folder>`. */
function aliasFolder(absPath: string): string {
  const [first, second] = path.relative(SRC, absPath).split(path.sep);
  return first === "components" && second === "ui" ? "ui" : (first ?? "");
}

/**
 * Where a file's comments are, as [start, end) offsets: `//` and `/* *\/`
 * outside strings and template literals. A quote that doesn't close on its
 * line (JSX text, a regex) ends there, and a backslash outside a string
 * escapes the next character, as in a regex literal.
 */
function commentSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote || (c === "\n" && quote !== "`")) quote = null;
      continue;
    }
    if (c === "\\") i++;
    else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) {
      const block = text[i + 1] === "*";
      const close = text.indexOf(block ? "*/" : "\n", i + 2);
      const end = close === -1 ? text.length : close + (block ? 2 : 0);
      spans.push([i, end]);
      i = end - 1;
    }
  }
  return spans;
}

const spansOf = new Map<string, [number, number][]>();

function isCommented(text: string, index: number): boolean {
  let spans = spansOf.get(text);
  if (!spans) {
    spans = commentSpans(text);
    spansOf.clear();
    spansOf.set(text, spans);
  }
  return spans.some(([start, end]) => index >= start && index < end);
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
    if (
      importedPath(rel, spec) === HAPTIC_MODULE &&
      path.posix.dirname(rel) !== HAPTIC_FOLDER
    ) {
      problems.push(
        `${at(match.index)}  "${spec}": only ${HAPTIC_FOLDER} may import the haptic trick; use a kit control's \`haptic\` prop (docs/decisions.md, "Haptics live in the kit")`,
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
        `${at(match.index)}  "${spec}": crosses from src/${from} into src/${to}; import it as "~/${aliasFolder(target)}/…"`,
      );
    }
  }

  if (from !== null && !isTestFile(rel)) {
    for (const match of text.matchAll(BARE_IMPORT)) {
      const spec = match[1] ?? "";
      const ours = spec.startsWith("~/") || spec.startsWith(".");
      if (!ours || /\.css(\?|$)/.test(spec)) continue;
      problems.push(
        `${at(match.index)}  "${spec}": imported only for its effect, which the browser's build leaves out; export something and call it (docs/decisions.md, "Our modules have no side effects on import")`,
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
  if (!FEED_LINK_FILES.includes(rel) && !isTestFile(rel)) {
    for (const match of text.matchAll(FEED_LINK)) {
      if (isCommented(text, match.index)) continue;
      problems.push(
        `${at(match.index)}  "${match[0]}": only ${FEED_LINK_FILES.join(" and ")} may touch the sealed feed link (docs/V3.md §5.1)`,
      );
    }
  }
  if (!isTestFile(rel)) {
    for (const table of SEALED_TABLES) {
      if (table.files.includes(rel)) continue;
      for (const match of text.matchAll(table.pattern)) {
        if (isCommented(text, match.index)) continue;
        problems.push(
          `${at(match.index)}  "${match[0]}": only ${table.files.join(", ")} may name it; ${table.use} (docs/DATA.md §7.7)`,
        );
      }
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
