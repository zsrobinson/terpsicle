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
 * Gzipped JS + CSS for the other entry pages (/settings, /signin, /privacy),
 * in bytes: 193 KB when this was set (v2 routes, for `/` too), mostly React,
 * the router and the route tree's search schemas, plus about 10% headroom.
 * Same rule for raising it.
 */
export const LANDING_BUDGET = 215 * 1024;

/**
 * Gzipped JS + CSS for / (the marketing page, whose first load is its search
 * ranking), in bytes: 232 KB when this was set (v3/landing-bundle; 330 KB
 * before it), plus about 3% headroom: React, the router with the route
 * tree's search schemas, the query client, the account's status, the app's
 * stylesheet and the page itself. Same rule for raising it; the 215 KB the
 * other entry pages aim for is the goal.
 */
export const MARKETING_BUDGET = 240 * 1024;

/**
 * What `/` loads on first use, never up front (docs/BUILD.md §5): the page
 * shows none of the app's frame, and its only popup is a tooltip.
 */
export const MARKETING_NEVER_EAGER: readonly {
  pattern: RegExp;
  why: string;
}[] = [
  {
    pattern:
      /^src\/(components\/(app-bar|product-menu|panel|panel-load-boundary)|features\/site\/(route-states|not-found-page|site-page))\.tsx$/,
    why: "the family bar, and the router's loading, failure and 404 states with it, load on first navigation (site/lazy-route-states.tsx)",
  },
  {
    pattern:
      /^src\/features\/(notifications\/bell|coffee\/|feedback\/feedback-button)/,
    why: "the family bar's controls load with it",
  },
  {
    pattern: /^src\/features\/auth\/(account-button|sign-in-panel)\.tsx$/,
    why: "the account menu loads when a signed-in visitor at /?stay sees it (marketing/frame.tsx)",
  },
  {
    pattern:
      /^src\/components\/ui\/(tooltip|dropdown-menu|popover|dialog|sheet|select|context-menu)\.tsx$|(^|\/)@radix-ui\/react-(tooltip|menu|popover|dialog)\/|(^|\/)@base-ui\/react\/(tooltip\/(?!provider\/)|menu\/|popover\/|dialog\/)|(^|\/)@floating-ui\//,
    why: "tooltips load on first pointer or key use (components/lazy-tooltip.tsx); / has no other popup",
  },
  { pattern: /(^|\/)sonner\//, why: "toasts load after the page (__root.tsx)" },
  {
    pattern: /(^|\/)@tanstack\/query-core\/build\/modern\/queryObserver\./,
    why: "nothing on / reads a query up front: only the client, for the router's context",
  },
];

/**
 * Gzipped JS + CSS for /chat/, in bytes: 279 KB when this was set (v2 chat
 * UI), plus about 10% headroom. That's `/`'s 208 KB, Radix's popover, menu,
 * select and dialog with vaul, and Chat itself; never the scheduler's
 * stores. Same rule for raising it.
 */
export const CHAT_BUDGET = 307 * 1024;

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
    pattern: /(^|\/)modern-screenshot\//,
    why: "feedback screenshots load when the sheet opens",
  },
  {
    // Only "Send feedback" itself is eager (docs/FEEDBACK.md).
    pattern:
      /^src\/(features\/feedback\/(?!feedback-button\.tsx$)|server\/fns\/feedback-api\.ts$|core\/schema\/feedback\.ts$|core\/feedback\/(context|redact|sanitize)\.ts$)/,
    why: "the feedback sheet loads on first hover or focus of Send feedback",
  },
  {
    // Only the bell and its count are eager (docs/V2.md §6.7).
    pattern:
      /^src\/(features\/notifications\/inbox\.tsx|server\/fns\/notifications\.ts)$/,
    why: "Notifications' list and client load on the bell's first hover, focus or open",
  },
  {
    // Only its status (a tiny store and the top bar's icon) is eager.
    pattern: /^src\/features\/sync\/(?!status)/,
    why: "plan sync loads only once someone is signed in",
  },
];

/**
 * Base UI's Drawer, beyond the sheet indent every page carries
 * (ui/sheet-indent.tsx): it loads with the first sheet (ActionMenu's on
 * phones only, Chat's room info on phones only) or with a workbench's phone
 * drawer, in their lazy chunks.
 */
const DRAWER_NEVER_EAGER = {
  pattern:
    /(^|\/)@base-ui\/react\/drawer\/(?!(provider|indent|indent-background)\/|popup\/DrawerPopupCssVars\.|backdrop\/DrawerBackdropCssVars\.)|^src\/components\/ui\/sheet\.tsx$/,
  why: "a drawer loads with the first sheet or a workbench's phone drawer, on phones",
};

/**
 * What the scheduler loads on first use rather than up front (docs/BUILD.md
 * §5): each of these once was eager, and they add up to about 40 KB.
 */
export const SCHEDULE_NEVER_EAGER: readonly { pattern: RegExp; why: string }[] =
  [
    {
      // Each is its tab's route (src/routes/schedule.<tab>.tsx), which the
      // router splits into its own chunk.
      pattern: /^src\/features\/(generate|travel|blocks|register)\//,
      why: "Generate, Travel, Blocks and Register load when first opened",
    },
    { pattern: /^src\/core\/ics\//, why: ".ics export loads with Register" },
    {
      pattern: /(^|\/)comlink\//,
      why: "the generator's worker client loads with Generate",
    },
    {
      // Base UI is one package: its Select's own modules, not the shared
      // parts (floating, utils) the menus and tooltips load anyway.
      pattern: /(^|\/)@base-ui\/react\/select\//,
      why: "selects are only in Generate and Blocks",
    },
    {
      pattern: /(^|\/)minisearch\/|^src\/core\/search\/search\.ts$/,
      why: "the text index loads when Search opens (use-course-search)",
    },
    {
      // Base UI's Drawer itself is the next rule's.
      pattern:
        /^src\/(features\/schedule\/mobile-drawer|components\/workbench\/drawer|features\/four-year\/plan-drawer)\.tsx$/,
      why: "a workbench's phone drawer loads on phones only (lazyDrawer)",
    },
    DRAWER_NEVER_EAGER,
  ];

/**
 * What must stay out of `/` and the pages around the scheduler: `/` may peek
 * at IndexedDB, nothing more.
 */
export const LANDING_NEVER_EAGER: readonly { pattern: RegExp; why: string }[] =
  [
    { pattern: /(^|\/)dexie\//, why: "only the scheduler opens Dexie" },
    {
      // The query client is on every page; its disk cache isn't.
      pattern: /(^|\/)@tanstack\/query-persist-client-core\//,
      why: "the query cache's persister loads with the data it keeps",
    },
    { pattern: /^src\/state\//, why: "the app's stores load with /schedule" },
    {
      pattern: /^src\/features\/schedule\/app\.tsx$/,
      why: "the app loads with /schedule",
    },
  ];

/**
 * Gzipped JS + CSS for each Terpsicle Reviews page, in bytes: 246 KB for
 * an instructor or course page when this was set (v2/reviews-ui; the home
 * page 218 KB), plus about 10% headroom. `/`'s React and router, plus the
 * review form with stage 0's rules, the grade bars and the published-data
 * reader. Same rule for raising it.
 */
export const REVIEWS_BUDGET = 270 * 1024;

/**
 * Reviews reads published files through the data layer's reader
 * (`src/state/data-source.ts`, which reaches the fixtures only in mock
 * builds) and nothing else of the scheduler's: no Dexie, no stores.
 */
export const REVIEWS_NEVER_EAGER: readonly { pattern: RegExp; why: string }[] =
  [
    { pattern: /(^|\/)dexie\//, why: "only the scheduler opens Dexie" },
    {
      pattern: /^src\/state\/(?!data-source\.ts$)/,
      why: "the app's stores load with /schedule",
    },
    {
      pattern: /^src\/features\/schedule\/app\.tsx$/,
      why: "the app loads with /schedule",
    },
  ];

/**
 * Gzipped JS + CSS for the admin panel (/admin, /admin/decisions, /admin/kit), in bytes:
 * 224 KB when this was set (v2 admin-shell), `/`'s base plus the panel, plus
 * about 10% headroom; 213 KB once the panel stopped using Radix's menu and
 * select (sharing them split them out of /schedule's chunk, which cost
 * /schedule about 5 KB). Same rule for raising it.
 */
export const ADMIN_BUDGET = 245 * 1024;

/**
 * Gzipped JS + CSS for /todo and /todo/connect, in bytes: 225 KB when this
 * was set (v3 todo-ui), `/`'s base plus the list, the week and the .ics
 * parser for dropped files, plus about 10% headroom. Same rule for raising it.
 */
export const TODO_BUDGET = 248 * 1024;

/**
 * Gzipped JS + CSS for /home (the installed app's start page, docs/V3.md
 * §1.5), in bytes: `/`'s base plus Todo's store and row, the published-data
 * reader, and the core it counts with (travel, problems, Plan's credits and
 * GenEds): 327 KB when this was set (v3/home; `/` was 291 KB then), plus
 * about 10% headroom. Same rule for raising it. Raised 22 KB, the measured
 * cost, when the kit's popups moved to Base UI (v3/kit-base-ui-popups:
 * 347.2 → 369.1 KB).
 */
export const HOME_BUDGET = 382 * 1024;

/** Todo loads with /todo, never with the scheduler. */
const TODO_NEVER_EAGER = {
  pattern: /^src\/(features\/todo\/|server\/fns\/todo\.ts$)/,
  why: "Todo loads with /todo, not the scheduler",
};

/**
 * Gzipped JS + CSS for /plan, in bytes: 290 KB when this was set (v3
 * plan-ui), `/`'s base plus Dexie, the course index store, the menus and
 * Plan's core (credits, GenEds, problems), plus about 10% headroom. Same
 * rule for raising it.
 */
export const PLAN_BUDGET = 320 * 1024;

/** Plan loads with /plan, never with anyone else's pages. */
const PLAN_NEVER_EAGER = {
  pattern: /^src\/features\/four-year\//,
  why: "Plan loads with /plan",
};

/**
 * Plan keeps the scheduler out: it opens Dexie for its own table and the
 * course index, and never the scheduler's app, stores, calendar or map.
 */
const PLAN_ROUTE_NEVER_EAGER: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /^src\/features\/schedule\/app\.tsx$/,
    why: "the scheduler's app loads with /schedule",
  },
  {
    pattern: /^src\/features\/four-year\/templates\//,
    why: "sample plans load when the Samples tab opens (V3 §2.11)",
  },
  {
    pattern:
      /^src\/state\/(workspace-store|ui-store|catalog-store|persist)\.ts$/,
    why: "Plan doesn't load the scheduler's stores",
  },
  {
    pattern: /^src\/features\/(calendar|courses|course-details|search)\//,
    why: "the scheduler's panels load with /schedule",
  },
  // Term status reads one date helper from ~/core/ics; the rest of .ics
  // export stays out, as for the scheduler.
  {
    pattern: /^src\/core\/ics\/(?!dates\.ts$)/,
    why: ".ics export loads with Register",
  },
  ...SCHEDULE_NEVER_EAGER.filter((r) => !r.pattern.test("src/core/ics/x.ts")),
];

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
  // The scheduler's layout, and the views a first visit lands on: plain
  // `/schedule` opens Courses (or the saved tab), and a seat-alert email opens
  // course details. Each tab and drill-in is a child route with its own chunk
  // (loaded with its parent's).
  ...["/schedule", "/schedule/courses", "/schedule/course/$code"].map(
    (route) => ({
      route,
      budget: EAGER_BUDGET,
      never: [
        {
          pattern: /^src\/state\/query\/course-index\.ts$/,
          why: "the course index loads with Plan, not the scheduler",
        },
        ...SCHEDULE_NEVER_EAGER,
        ADMIN_NEVER_EAGER,
        TODO_NEVER_EAGER,
        PLAN_NEVER_EAGER,
        {
          pattern: /^src\/(features|core)\/chat\//,
          why: "course details loads Chat's way in on demand, only while Chat is on",
        },
      ],
    }),
  ),
  {
    route: "/chat/",
    budget: CHAT_BUDGET,
    never: [
      ...LANDING_NEVER_EAGER,
      ADMIN_NEVER_EAGER,
      PLAN_NEVER_EAGER,
      DRAWER_NEVER_EAGER,
    ],
  },
  // Plan's layout and every view's route: GenEd at `/plan/`, and each other
  // view, which a link can open first.
  ...[
    "/plan",
    "/plan/",
    "/plan/problems",
    "/plan/search",
    "/plan/samples",
    "/plan/import",
  ].map((route) => ({
    route,
    budget: PLAN_BUDGET,
    never: [
      // Samples asks when the four-year plan starts with the kit's Select,
      // so a link straight to it carries Base UI's select (as Generate's
      // does on /schedule). Every other Plan route stays without it: the
      // first visit, which asks too, is its own chunk (v3/cohesion-plan).
      ...PLAN_ROUTE_NEVER_EAGER.filter(
        (r) =>
          route !== "/plan/samples" ||
          !r.pattern.test("node_modules/@base-ui/react/select/index.mjs"),
      ),
      ADMIN_NEVER_EAGER,
      TODO_NEVER_EAGER,
    ],
  })),
  // Todo keeps `/`'s rules: no Dexie and no scheduler stores (course colors
  // are a raw IndexedDB read).
  ...["/todo/", "/todo/connect"].map((route) => ({
    route,
    budget: TODO_BUDGET,
    never: [...LANDING_NEVER_EAGER, ADMIN_NEVER_EAGER, PLAN_NEVER_EAGER],
  })),
  // Home reads this device's plans raw (no Dexie, no scheduler stores) and
  // published files through Reviews' reader.
  {
    route: "/home",
    budget: HOME_BUDGET,
    never: [...REVIEWS_NEVER_EAGER, ADMIN_NEVER_EAGER, PLAN_NEVER_EAGER],
  },
  {
    route: "/",
    budget: MARKETING_BUDGET,
    never: [
      ...LANDING_NEVER_EAGER,
      ...MARKETING_NEVER_EAGER,
      ADMIN_NEVER_EAGER,
      PLAN_NEVER_EAGER,
    ],
  },
  ...["/settings", "/signin", "/privacy"].map((route) => ({
    route,
    budget: LANDING_BUDGET,
    never: [...LANDING_NEVER_EAGER, ADMIN_NEVER_EAGER, PLAN_NEVER_EAGER],
  })),
  ...["/reviews/", "/reviews/$slug", "/reviews/mine", "/reviews/policy"].map(
    (route) => ({
      route,
      budget: REVIEWS_BUDGET,
      never: [...REVIEWS_NEVER_EAGER, ADMIN_NEVER_EAGER, PLAN_NEVER_EAGER],
    }),
  ),
  ...["/admin/", "/admin/decisions", "/admin/kit"].map((route) => ({
    route,
    budget: ADMIN_BUDGET,
    never: [...LANDING_NEVER_EAGER, PLAN_NEVER_EAGER],
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
  routes: Record<string, { preloads?: string[]; children?: string[] }>;
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
  // A nested route loads with the routes it's nested in (`/schedule/courses`
  // with `/schedule`).
  const parentOf = (id: string) =>
    Object.keys(routes).find((r) => routes[r]?.children?.includes(id));
  const parents: string[] = [];
  for (let p = parentOf(route); p && p !== "__root__"; p = parentOf(p))
    parents.push(p);
  const preloads = [
    ...(routes.__root__?.preloads ?? []),
    ...parents.flatMap((r) => routes[r]?.preloads ?? []),
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
