import type { Plugin } from "vite";
import { type BundleGraph, chunkGraph } from "./bundle-graph";
import { eagerChunks, linkedCss } from "./check-bundle";

// The service worker's precache list: the app shell's hashed build files,
// taken from the client build and handed to the Worker's build, which serves
// /sw.js with the list inside (src/server/service-worker.ts). The client
// builds first; the Worker (the "ssr" environment) builds after it.
//
// The shell is what any page needs before it can draw: the client entry,
// every route's own chunk, what those import statically, and their CSS. Lazy
// chunks (the route map, the generator, PostHog, mock fixtures) are cached
// the first time they load instead.

export const PRECACHE_MODULE = "virtual:terpsicle/precache";
const RESOLVED = `\0${PRECACHE_MODULE}`;

/** A TanStack route's split-out component chunk. */
const ROUTE_CHUNK = /^src\/routes\/[^?]+\?tsr-split=/;

/** URLs to precache, from the client build's chunk graph and chunk code. */
export function shellFiles(
  graph: BundleGraph,
  codeOf: (file: string) => string,
): string[] {
  const starts = Object.keys(graph).filter((file) => {
    const chunk = graph[file];
    return (
      chunk !== undefined &&
      (chunk.isEntry || chunk.modules.some((m) => ROUTE_CHUNK.test(m)))
    );
  });
  const chunks = eagerChunks(graph, starts);
  const css = new Set<string>();
  for (const file of chunks) {
    for (const sheet of graph[file]?.css ?? []) css.add(sheet);
    for (const sheet of linkedCss(codeOf(file))) css.add(sheet);
  }
  return [...chunks, ...[...css].sort()].map((file) => `/${file}`);
}

export function pwaPrecache(root: string): Plugin {
  // Shared by both environments: the client build fills it, the Worker's reads it.
  let files: string[] = [];
  return {
    name: "terpsicle:pwa-precache",
    resolveId(id) {
      return id === PRECACHE_MODULE ? RESOLVED : undefined;
    },
    load(id) {
      // Empty in dev: there are no hashed files to precache.
      if (id === RESOLVED)
        return `export const PRECACHE = ${JSON.stringify(files)};\n`;
      return undefined;
    },
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      files = shellFiles(chunkGraph(bundle, root), (file) => {
        const output = bundle[file];
        return output?.type === "chunk" ? output.code : "";
      });
    },
  };
}
