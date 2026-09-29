import type { Plugin } from "vite";
import { type BundleGraph, chunkGraph } from "./bundle-graph";
import { eagerChunks, linkedCss } from "./check-bundle";

// The service worker's precache list: the app shell's hashed build files,
// taken from the client build and handed to the Worker's build, which serves
// /sw.js with the list inside (src/server/service-worker.ts). The client
// builds first; the Worker (the "ssr" environment) builds after it.
//
// The shell is what any page needs before it can draw: the client entry,
// every route's own chunk, what those import statically, and their CSS. It
// also takes the chunks every page loads on first use rather than up front
// (`ON_DEMAND_SHELL`): the router's loading, failure and 404 states, the
// toasts (Undo is how the app does without confirmation dialogs), the
// tooltips and the family bar, so they're there offline after a deploy too.
// Lazy chunks only some pages use (the route map, the generator, PostHog,
// mock fixtures) are cached the first time they load instead.
//
// The same build hands the Worker the route states' files, which pages
// other than `/` preload from their head (`ROUTE_STATES_PRELOAD`,
// src/routes/__root.tsx), since a page drawn as loading needs them to
// hydrate.

export const PRECACHE_MODULE = "virtual:terpsicle/precache";
export const ROUTE_STATES_MODULE = "virtual:terpsicle/route-states-preload";
const RESOLVED = `\0${PRECACHE_MODULE}`;
const RESOLVED_ROUTE_STATES = `\0${ROUTE_STATES_MODULE}`;

/** A TanStack route's split-out component chunk. */
const ROUTE_CHUNK = /^src\/routes\/[^?]+\?tsr-split=/;

/** The router's loading, failure and 404 states (src/features/site/lazy-route-states.tsx). */
export const ROUTE_STATES =
  /^src\/features\/site\/(route-states|not-found-page)\.tsx$/;

/** What every page loads on first use, kept for offline anyway (above). */
export const ON_DEMAND_SHELL: readonly RegExp[] = [
  ROUTE_STATES,
  /^src\/components\/ui\/(sonner|toast|tooltip)\.tsx$/,
  /^src\/components\/app-bar\.tsx$/,
  /^src\/features\/auth\/account-button\.tsx$/,
];

const holds = (graph: BundleGraph, file: string, patterns: readonly RegExp[]) =>
  graph[file]?.modules.some((m) => patterns.some((p) => p.test(m))) ?? false;

/** URLs to precache, from the client build's chunk graph and chunk code. */
export function shellFiles(
  graph: BundleGraph,
  codeOf: (file: string) => string,
): string[] {
  const starts = Object.keys(graph).filter((file) => {
    const chunk = graph[file];
    return (
      chunk !== undefined &&
      (chunk.isEntry ||
        chunk.modules.some((m) => ROUTE_CHUNK.test(m)) ||
        holds(graph, file, ON_DEMAND_SHELL))
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

/**
 * The route states' chunks and what they import, less what the client entry
 * already loads: the files a page preloads so it can hydrate a page drawn
 * as loading without waiting on them.
 */
export function routeStatesFiles(graph: BundleGraph): string[] {
  const entries = Object.keys(graph).filter((f) => graph[f]?.isEntry);
  const eager = new Set(eagerChunks(graph, entries));
  const states = Object.keys(graph).filter((f) =>
    holds(graph, f, [ROUTE_STATES]),
  );
  return eagerChunks(graph, states)
    .filter((file) => !eager.has(file))
    .map((file) => `/${file}`);
}

export function pwaPrecache(root: string): Plugin {
  // Shared by both environments: the client build fills them, the Worker's
  // reads them. Empty in dev, and in the client's own build, which is made
  // before its files have names.
  let files: string[] = [];
  let routeStates: string[] = [];
  return {
    name: "terpsicle:pwa-precache",
    resolveId(id) {
      if (id === PRECACHE_MODULE) return RESOLVED;
      if (id === ROUTE_STATES_MODULE) return RESOLVED_ROUTE_STATES;
      return undefined;
    },
    load(id) {
      if (id === RESOLVED)
        return `export const PRECACHE = ${JSON.stringify(files)};\n`;
      if (id === RESOLVED_ROUTE_STATES)
        return `export const ROUTE_STATES_PRELOAD = ${JSON.stringify(routeStates)};\n`;
      return undefined;
    },
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      const graph = chunkGraph(bundle, root);
      files = shellFiles(graph, (file) => {
        const output = bundle[file];
        return output?.type === "chunk" ? output.code : "";
      });
      routeStates = routeStatesFiles(graph);
    },
  };
}
