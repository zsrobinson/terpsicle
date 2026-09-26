import { createHash } from "node:crypto";
import path from "node:path";
import { minify, type Plugin, runnerImport } from "vite";

// The document's inline <script>s, built once from their source so the CSP
// can allow exactly them by hash (docs/V2.md §12).
//
// src/app/inline-scripts.ts lists them. This plugin evaluates that file in
// Node, minifies each script, and hands out the result as literals:
//
//   virtual:terpsicle/inline-scripts         the text, for the app to render
//   virtual:terpsicle/inline-script-hashes   their CSP hashes, for the Worker
//
// The browser build, the Worker build and every test read the same literals,
// so a hash always matches what the HTML carries. Rendering `fn.toString()`
// from the bundle instead wouldn't: the bundler prints a function
// differently in each build.

export const INLINE_SCRIPTS_ID = "virtual:terpsicle/inline-scripts";
export const INLINE_SCRIPT_HASHES_ID = "virtual:terpsicle/inline-script-hashes";

/** Where the list of inline scripts lives, relative to the repo root. */
export const INLINE_SCRIPTS_SOURCE = "src/app/inline-scripts.ts";

/** A CSP hash source for a script's exact text: `'sha256-<base64>'`. */
export function cspHash(text: string): string {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

/** Minified text for each script, and the sorted, distinct hashes. */
export async function buildInlineScripts(
  sources: Record<string, unknown>,
): Promise<{ scripts: Record<string, string>; hashes: string[] }> {
  const scripts: Record<string, string> = {};
  for (const [name, source] of Object.entries(sources)) {
    if (typeof source !== "string" || source.trim() === "")
      throw new Error(`Inline script "${name}" has no text.`);
    // A classic script, not a module: its top level is the page's global
    // scope, so the minifier renames nothing there.
    const out = await minify(`${name}.js`, source, {
      module: false,
      compress: true,
      mangle: true,
    });
    const [error] = out.errors;
    if (error)
      throw new Error(`Inline script "${name}": ${error.message}`, {
        cause: error,
      });
    const text = out.code.trim();
    // The HTML parser ends a script at the first "</script", whatever the
    // JavaScript around it means.
    if (/<\/script/i.test(text))
      throw new Error(`Inline script "${name}" contains "</script".`);
    scripts[name] = text;
  }
  const hashes = [...new Set(Object.values(scripts).map(cspHash))].sort();
  return { scripts, hashes };
}

/**
 * Evaluates src/app/inline-scripts.ts in Node: each script's source text,
 * and every file that went into it (to rebuild when one changes).
 */
export async function loadInlineScriptSources(
  root: string,
): Promise<{ sources: Record<string, unknown>; dependencies: string[] }> {
  const file = path.join(root, INLINE_SCRIPTS_SOURCE);
  const { module, dependencies } = await runnerImport<{
    INLINE_SCRIPT_SOURCES?: unknown;
  }>(file, {
    root,
    configFile: false,
    logLevel: "error",
    resolve: { tsconfigPaths: true },
  });
  const sources = module.INLINE_SCRIPT_SOURCES;
  if (typeof sources !== "object" || sources === null)
    throw new Error(
      `${INLINE_SCRIPTS_SOURCE} must export INLINE_SCRIPT_SOURCES.`,
    );
  return { sources: { ...sources }, dependencies: [file, ...dependencies] };
}

const RESOLVED_SCRIPTS = `\0${INLINE_SCRIPTS_ID}`;
const RESOLVED_HASHES = `\0${INLINE_SCRIPT_HASHES_ID}`;

interface Built {
  code: { scripts: string; hashes: string };
  dependencies: string[];
}

/** Serves both virtual modules; rebuilds them when a script's source changes. */
export function inlineScripts(root: string): Plugin {
  let built: Promise<Built> | null = null;
  const build = () => {
    built ??= (async () => {
      const { sources, dependencies } = await loadInlineScriptSources(root);
      const { scripts, hashes } = await buildInlineScripts(sources);
      return {
        code: {
          scripts: `export const INLINE_SCRIPTS = ${JSON.stringify(scripts)};\n`,
          hashes: `export const INLINE_SCRIPT_HASHES = ${JSON.stringify(hashes)};\n`,
        },
        dependencies,
      };
    })();
    // A failed build (a syntax error mid-edit) is retried on the next load.
    built.catch(() => {
      built = null;
    });
    return built;
  };
  return {
    name: "terpsicle:inline-scripts",
    // One build shared by every environment (browser, Worker), so both get
    // the same text.
    sharedDuringBuild: true,
    resolveId(id) {
      if (id === INLINE_SCRIPTS_ID) return RESOLVED_SCRIPTS;
      if (id === INLINE_SCRIPT_HASHES_ID) return RESOLVED_HASHES;
      return undefined;
    },
    async load(id) {
      if (id !== RESOLVED_SCRIPTS && id !== RESOLVED_HASHES) return undefined;
      const { code, dependencies } = await build();
      for (const file of dependencies) this.addWatchFile(file);
      return id === RESOLVED_SCRIPTS ? code.scripts : code.hashes;
    },
    async hotUpdate({ file }) {
      const current = built;
      if (!current) return;
      const { dependencies } = await current.catch(() => ({
        dependencies: [] as string[],
      }));
      if (!dependencies.includes(file)) return;
      built = null;
      for (const id of [RESOLVED_SCRIPTS, RESOLVED_HASHES]) {
        const mod = this.environment.moduleGraph.getModuleById(id);
        if (mod) this.environment.moduleGraph.invalidateModule(mod);
      }
    },
  };
}
