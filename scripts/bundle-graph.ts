import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

// The client build's chunk graph, for scripts/check-bundle.ts: which chunks
// import which, statically or lazily, and which source modules each holds.
// Written next to dist/client (never inside it, so it isn't deployed).

export type BundleChunk = {
  isEntry: boolean;
  /** Static imports: loaded together with this chunk. */
  imports: string[];
  dynamicImports: string[];
  /** CSS the chunk pulls in when it loads. */
  css: string[];
  /** Source modules, relative to the repo root. */
  modules: string[];
};
export type BundleGraph = Record<string, BundleChunk>;

export const BUNDLE_GRAPH_FILE = "dist/bundle-graph.json";

export function bundleGraph(root: string): Plugin {
  return {
    name: "terpsicle:bundle-graph",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    writeBundle(_options, bundle) {
      const graph: BundleGraph = {};
      for (const [file, output] of Object.entries(bundle)) {
        if (output.type !== "chunk") continue;
        graph[file] = {
          isEntry: output.isEntry,
          imports: [...output.imports],
          dynamicImports: [...output.dynamicImports],
          css: [...(output.viteMetadata?.importedCss ?? [])],
          modules: output.moduleIds.map((id) =>
            path
              .relative(root, id.replace(/^\0/, ""))
              .split(path.sep)
              .join("/"),
          ),
        };
      }
      const out = path.join(root, BUNDLE_GRAPH_FILE);
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(graph, null, 1));
    },
  };
}
