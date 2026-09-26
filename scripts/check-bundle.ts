// Each entry route's eager bundle, reported against a guide size (BUILD §5:
// first load < 1.5 MB compressed), and the modules that must never load up
// front, which fail the check. Run after `pnpm build`:
//
//   pnpm check:bundle
//
// "Eager" is what a visit to a route loads before any interaction: the
// client entry, the route's chunks TanStack Start preloads, everything they
// import statically, and their CSS. Lazy chunks (the route map, PostHog, mock
// fixtures) don't count, and some modules must never be eager at all.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { BUNDLE_GRAPH_FILE, type BundleGraph } from "./bundle-graph";
import { isMain, ROOT } from "./lib/source-files";

/**
 * Gzipped JS + CSS for /schedule, in bytes: 335 KB when this was set
 * (perf/schedule-bundle moved the later rail tabs, the phone drawer and the
 * search index out of the first load), plus about 10 KB headroom. Raise it on
 * purpose, in the PR that needs it, never to get a build green; first see
 * whether the new code can load on first use (docs/BUILD.md §5).
 */
export const EAGER_BUDGET = 345 * 1024;

/**
 * Gzipped JS + CSS for / (the marketing page), in bytes: 193 KB when this
 * was set (v2 routes), mostly React, the router and the route tree's search
 * schemas, plus about 10% headroom. Same rule for raising it.
 */
export const LANDING_BUDGET = 215 * 1024;

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
  {
    // Only its status (a tiny store and the top bar's icon) is eager.
    pattern: /^src\/features\/sync\/(?!status)/,
    why: "plan sync loads only once someone is signed in",
  },
];

/**
 * What the scheduler loads on first use rather than up front (docs/BUILD.md
 * §5): each of these once was eager, and they add up to about 40 KB.
 */
export const SCHEDULE_NEVER_EAGER: readonly { pattern: RegExp; why: string }[] =
  [
    {
      // Their panels.tsx registers them with lazyPanel; everything else in
      // the folder is the panel's own.
      pattern:
        /^src\/features\/(generate|travel|blocks|export)\/(?!panels\.tsx$)/,
      why: "Generate, Travel, Blocks and Export load when first opened",
    },
    { pattern: /^src\/core\/ics\//, why: ".ics export loads with Export" },
    {
      pattern: /(^|\/)comlink\//,
      why: "the generator's worker client loads with Generate",
    },
    {
      pattern: /(^|\/)@radix-ui\/react-select\//,
      why: "selects are only in Generate and Blocks",
    },
    {
      pattern: /(^|\/)minisearch\/|^src\/core\/search\/search\.ts$/,
      why: "the text index loads when Search opens (use-course-search)",
    },
    {
      pattern: /(^|\/)vaul\/|^src\/app\/mobile-drawer\.tsx$/,
      why: "the phone drawer loads on phones only (app-shell)",
    },
  ];

/**
 * What must stay out of `/` and the pages around the scheduler: `/` may peek
 * at IndexedDB, nothing more.
 */
export const LANDING_NEVER_EAGER: readonly { pattern: RegExp; why: string }[] =
  [
    { pattern: /(^|\/)dexie\//, why: "only the scheduler opens Dexie" },
    { pattern: /^src\/state\//, why: "the app's stores load with /schedule" },
    { pattern: /^src\/app\/app\.tsx$/, why: "the app loads with /schedule" },
  ];

/**
 * Gzipped JS + CSS for the admin panel (/admin, /admin/decisions), in bytes:
 * 224 KB when this was set (v2 admin-shell), `/`'s base plus the panel, plus
 * about 10% headroom; 213 KB once the panel stopped using Radix's menu and
 * select (sharing them split them out of /schedule's chunk, which cost
 * /schedule about 5 KB). Same rule for raising it.
 */
export const ADMIN_BUDGET = 245 * 1024;

/** The owner's panel loads with /admin, never with anyone else's pages. */
const ADMIN_NEVER_EAGER = {
  pattern: /^src\/features\/admin\//,
  why: "the admin panel loads with /admin",
};

/**
 * Each entry route (docs/V2.md §1.1), its budget and its extra never-eager
 * rules. The pages other tracks fill in start on `/`'s budget and rules, so
 * none of them pulls in the scheduler; the PR that builds one gives it its
 * own budget.
 */
export const ROUTE_BUDGETS: readonly {
  route: string;
  budget: number;
  never: readonly { pattern: RegExp; why: string }[];
}[] = [
  {
    route: "/schedule",
    budget: EAGER_BUDGET,
    never: [
      {
        pattern: /^src\/state\/course-index-store\.ts$/,
        why: "the course index loads with Plan, not the scheduler",
      },
      ...SCHEDULE_NEVER_EAGER,
      ADMIN_NEVER_EAGER,
    ],
  },
  ...["/", "/reviews/", "/chat/", "/settings", "/signin", "/privacy"].map(
    (route) => ({
      route,
      budget: LANDING_BUDGET,
      never: [...LANDING_NEVER_EAGER, ADMIN_NEVER_EAGER],
    }),
  ),
  ...["/admin/", "/admin/decisions"].map((route) => ({
    route,
    budget: ADMIN_BUDGET,
    never: LANDING_NEVER_EAGER,
  })),
];

/**
 * Text that must never be in the build: the contact address stays away from
 * scrapers (src/features/site/contact-email.tsx). Joined here so this file
 * doesn't hold it either.
 */
export const NEVER_IN_BUILD: readonly string[] = [
  ["admin", "terpsicle.com"].join("@"),
];

/** "file: contains …" for each build file that holds forbidden text. */
export function forbiddenText(
  files: readonly { file: string; text: string }[],
): string[] {
  return files.flatMap(({ file, text }) =>
    NEVER_IN_BUILD.filter((t) => text.includes(t)).map(
      (t) => `${file}: contains "${t}"`,
    ),
  );
}

/** Every file under `dir`, recursively, relative to ROOT. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(ROOT, path.join(e.parentPath, e.name)));
}

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
  extra: readonly { pattern: RegExp; why: string }[] = [],
): string[] {
  const rules = [...NEVER_EAGER, ...extra];
  return chunks.flatMap((file) =>
    (graph[file]?.modules ?? []).flatMap((module) =>
      rules
        .filter((rule) => rule.pattern.test(module))
        .map((rule) => `${file}: ${module} (${rule.why})`),
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

/** Prints one route's eager files; returns its problems. */
function checkRoute(
  graph: BundleGraph,
  routes: RouteManifest["routes"],
  { route, budget, never }: (typeof ROUTE_BUDGETS)[number],
): string[] {
  const client = path.join(ROOT, "dist/client");
  if (!routes[route]) return [`${route}: not in the route manifest`];
  const preloads = [
    ...(routes.__root__?.preloads ?? []),
    ...(routes[route]?.preloads ?? []),
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
  console.log(`Eager JS and CSS for ${route} (gzip -9)\n`);
  console.log(
    `${"File".padEnd(width)}  ${"Raw".padStart(10)}  ${"Gzip".padStart(10)}`,
  );
  for (const r of rows.sort((a, b) => b.gzip - a.gzip))
    console.log(
      `${r.file.padEnd(width)}  ${kb(r.raw).padStart(10)}  ${kb(r.gzip).padStart(10)}`,
    );
  console.log(
    `${"Total".padEnd(width)}  ${"".padStart(10)}  ${kb(total).padStart(10)}  (budget ${kb(budget)})\n`,
  );

  const problems = forbiddenModules(graph, chunks, never).map(
    (p) => `${route}: ${p}`,
  );
  // The total is reported, not enforced (the owner, 2026-09-26: page size
  // shouldn't hold up merges). The never-eager rules above still fail: they
  // catch a whole feature slipping into the first load, which a few KB of
  // ordinary growth never is.
  if (total > budget)
    console.warn(
      `note: ${route}'s eager bundle is ${kb(total)}, over its ${kb(budget)} guide. Worth a look for anything that could load on first use.\n`,
    );
  return problems;
}

async function main() {
  const graphFile = path.join(ROOT, BUNDLE_GRAPH_FILE);
  if (!existsSync(graphFile)) {
    console.error(`${BUNDLE_GRAPH_FILE} is missing. Run pnpm build first.`);
    process.exitCode = 1;
    return;
  }
  const graph = JSON.parse(readFileSync(graphFile, "utf8")) as BundleGraph;
  const { routes } = await routeManifest();
  const problems = [
    ...ROUTE_BUDGETS.flatMap((r) => checkRoute(graph, routes, r)),
    ...forbiddenText(
      filesUnder(path.join(ROOT, "dist")).map((file) => ({
        file,
        text: readFileSync(path.join(ROOT, file), "latin1"),
      })),
    ),
  ];
  if (problems.length > 0) {
    console.error(`bundle: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
  } else console.log("bundle: ok");
}

if (isMain(import.meta.url)) await main();
