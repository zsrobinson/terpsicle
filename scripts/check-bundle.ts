// The app route's eager bundle, held to a budget (BUILD §5: first load
// < 1.5 MB compressed; regressions fail CI). Run after `pnpm build`:
//
//   pnpm check:bundle
//
// "Eager" is what a visit to / loads before any interaction: the client
// entry, the / route's chunks TanStack Start preloads, everything they import
// statically, and their CSS. Lazy chunks (the route map, PostHog, mock
// fixtures) don't count, and some modules must never be eager at all.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { BUNDLE_GRAPH_FILE, type BundleGraph } from "./bundle-graph";
import { isMain, ROOT } from "./lib/source-files";

/**
 * Gzipped JS + CSS for /, in bytes: 343 KB when this was set (M8), plus about
 * 10% headroom. Raise it on purpose, in the PR that needs it, never to get
 * a build green.
 */
export const EAGER_BUDGET = 380 * 1024;

/** Modules that must only ever load on demand, and why. */
export const NEVER_EAGER: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /(^|\/)maplibre-gl\//, why: "MapLibre loads with the route map" },
  {
    pattern: /^src\/worker\/generate(\.worker|-job)\.ts$/,
    why: "the generator runs in its Web Worker",
  },
  {
    // UI code imports ~/core/generate/<module>, not the barrel, for this.
    pattern: /^src\/core\/generate\/(solve|generate|near-miss)\.ts$/,
    why: "the search itself runs in the generator's worker",
  },
  { pattern: /^src\/fixtures\//, why: "fixtures are for mock mode only" },
];

/** Chunks loaded with `starts`, following static imports only. */
export function eagerChunks(
  graph: BundleGraph,
  starts: readonly string[],
): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file) || !graph[file]) return;
    seen.add(file);
    for (const next of graph[file].imports) visit(next);
  };
  for (const file of starts) visit(file);
  return [...seen].sort();
}

/** "file: module (why)" for each forbidden module in the given chunks. */
export function forbiddenModules(
  graph: BundleGraph,
  chunks: readonly string[],
): string[] {
  return chunks.flatMap((file) =>
    (graph[file]?.modules ?? []).flatMap((module) =>
      NEVER_EAGER.filter((rule) => rule.pattern.test(module)).map(
        (rule) => `${file}: ${module} (${rule.why})`,
      ),
    ),
  );
}

/** Stylesheets a chunk links from the document head (`/assets/x.css`). */
export function linkedCss(code: string): string[] {
  return [...code.matchAll(/["'`]\/(assets\/[^"'`]+\.css)["'`]/g)].map(
    (m) => m[1] ?? "",
  );
}

type RouteManifest = {
  routes: Record<string, { preloads?: string[] }>;
};

/** TanStack Start's route manifest from the server build. */
async function routeManifest(): Promise<RouteManifest> {
  const dir = path.join(ROOT, "dist/server/assets");
  const file = readdirSync(dir).find((f) =>
    f.startsWith("_tanstack-start-manifest"),
  );
  if (!file) throw new Error(`No TanStack Start manifest in ${dir}`);
  const mod = (await import(pathToFileURL(path.join(dir, file)).href)) as {
    tsrStartManifest: () => RouteManifest;
  };
  return mod.tsrStartManifest();
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

async function main() {
  const graphFile = path.join(ROOT, BUNDLE_GRAPH_FILE);
  if (!existsSync(graphFile)) {
    console.error(`${BUNDLE_GRAPH_FILE} is missing. Run pnpm build first.`);
    process.exitCode = 1;
    return;
  }
  const graph = JSON.parse(readFileSync(graphFile, "utf8")) as BundleGraph;
  const client = path.join(ROOT, "dist/client");
  const { routes } = await routeManifest();
  const preloads = [
    ...(routes.__root__?.preloads ?? []),
    ...(routes["/"]?.preloads ?? []),
  ].map((url) => url.replace(/^\//, ""));
  const entries = Object.keys(graph).filter((f) => graph[f]?.isEntry);
  const chunks = eagerChunks(graph, [...entries, ...preloads]);

  const css = new Set<string>();
  for (const file of chunks) {
    for (const sheet of graph[file]?.css ?? []) css.add(sheet);
    for (const sheet of linkedCss(
      readFileSync(path.join(client, file), "utf8"),
    ))
      css.add(sheet);
  }
  const rows = [...chunks, ...[...css].sort()].map((file) => {
    const bytes = readFileSync(path.join(client, file));
    return {
      file,
      raw: bytes.length,
      gzip: gzipSync(bytes, { level: 9 }).length,
    };
  });
  const total = rows.reduce((n, r) => n + r.gzip, 0);

  const width = Math.max(...rows.map((r) => r.file.length), 5);
  console.log(`Eager JS and CSS for / (gzip -9)\n`);
  console.log(
    `${"File".padEnd(width)}  ${"Raw".padStart(10)}  ${"Gzip".padStart(10)}`,
  );
  for (const r of rows.sort((a, b) => b.gzip - a.gzip))
    console.log(
      `${r.file.padEnd(width)}  ${kb(r.raw).padStart(10)}  ${kb(r.gzip).padStart(10)}`,
    );
  console.log(
    `${"Total".padEnd(width)}  ${"".padStart(10)}  ${kb(total).padStart(10)}  (budget ${kb(EAGER_BUDGET)})\n`,
  );

  const problems = forbiddenModules(graph, chunks);
  if (total > EAGER_BUDGET)
    problems.push(
      `eager bundle is ${kb(total)}, over the ${kb(EAGER_BUDGET)} budget: lazy-load something, or raise EAGER_BUDGET in scripts/check-bundle.ts on purpose`,
    );
  if (problems.length > 0) {
    console.error(`bundle: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
  } else console.log("bundle: ok");
}

if (isMain(import.meta.url)) await main();
