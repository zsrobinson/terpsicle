---
name: framework-first
description: Check what TanStack Start, Router and Query, Cloudflare and our libraries already do before building infrastructure. Use when adding a route, page, tab or drill-in, putting state in the URL, fetching or caching server data, polling, lazy loading, retrying, optimistic updates, scheduling work, storing data, or building a form.
---

# Framework first

We build on TanStack Start (`@tanstack/react-start` 1.168), Router (`@tanstack/react-router` 1.170) and Query (`@tanstack/react-query` 5.104) on Cloudflare Workers. The scheduler once had a homemade panel registry, a `lazyPanel` wrapper and URL sync, rebuilding things the router gives for free; `v2/schedule-routes` made its tabs and drill-ins routes. This skill keeps that from happening again.

## The checklist

Before writing any of these, find the platform's version:

| You're about to build | Reach for |
|---|---|
| A new view, tab, drill-in or page | A route (nested under its product's route) |
| State that Back should undo, or a link should carry | Search params with `validateSearch` |
| Fetching or caching server data (`/data` files, `/api` answers) | A `queryOptions` factory in the area and `useQuery`; in a route, `context.queryClient.ensureQueryData` in its `loader` (with `loaderDeps` for search params) |
| "Load once", an in-flight map, dedupe | Query already dedupes by key; set `staleTime` |
| Refetch on focus, on reconnect, or every N seconds | `refetchOnWindowFocus` (on by default), `refetchOnReconnect`, `refetchInterval` |
| Retrying a failed load | The factory's `retry` (published files: `retryPublished`) |
| An optimistic write with rollback | `useMutation` with `onMutate`, `onError`, `onSettled`; Undo in the toast calls the inverse mutation |
| A server answer that should survive a reload or work offline | The per-query persister (`~/state/query/persister.ts`), for published data only |
| Lazy loading or code splitting | A route: Start splits route components automatically |
| Prefetching on hover | `Link`; the router already has `defaultPreload: "intent"` |
| Back, Forward, "go back to where I was" | `useNavigate`, `navigate({ replace: true })`, the router's history |
| A scheduled job | A Cron Trigger and an entry in `CRON_JOBS` |
| Shared live state, sockets | A Durable Object (see below) |
| A component (dialog, menu, tooltip, tabs) | Radix through `src/components/ui` (shadcn/ui) |
| Validation | zod schemas in `src/core/schema` |
| Browser storage for local-first data (plans, docs, prefs) | Dexie (`src/state/db.ts`); a cache of server data is the query cache instead |
| App state that isn't URL state or server data | zustand |

If the platform can't do it, or doing it the platform's way costs more than it saves, hand-roll it and say why in the PR body. Reshaping the feature to fit the platform usually wins.

## How-tos

Read the real docs when a detail matters; they're at `https://tanstack.com/router/latest/docs/framework/react/` (append `.md` to a page's path for plain text). Where this skill is unsure, it says "check the docs": don't guess an API.

**Add a route.** Files in `src/routes` use flat dot names: `reviews.index.tsx` is `/reviews`, and `schedule.search.tsx` would be a child of `schedule.tsx`, which renders `<Outlet />` where its children go. `$param` is a path param, a `_` prefix is a pathless layout, and a `-` prefix keeps a file out of the tree. The plugin regenerates `src/routeTree.gen.ts`; commit it (CI checks it's current). Keep route files thin: the component comes from `src/features/<feature>`.

**Put state in search params.** Give the route `validateSearch` a zod schema from `src/core/schema`; zod 4 is a Standard Schema, so no adapter is needed (`src/routes/schedule.search.tsx` does this). Make bad values drop out with `.optional().catch(undefined)` so the rest of a link still works. Read with `Route.useSearch()`; write with `<Link search={...}>` or `navigate({ search: (prev) => ({ ...prev, tab }) })`. (The scheduler is the exception: its sidebar keeps route components mounted outside their match, so they read with `useTabSearch` and `useDrillEntry` instead; `src/app/README.md`.) Push for things Back should undo; pass `replace: true` for typing and other transient changes (`docs/decisions.md`, "Back and Forward undo navigation"). Search params are inherited by child routes. For params that should survive or disappear across links, look at `retainSearchParams` and `stripSearchParams` (check the docs). `src/core/schema/schedule-url.ts` is a worked example: the scheduler's search params, with every bad value dropped.

**Load data.** A `loader` runs before the route renders and on preload; `loaderDeps: ({ search }) => ({ … })` names the search params it depends on. Read it with `Route.useLoaderData()`. Server data is cached by Query (below), so a loader calls `ensureQueryData` rather than returning its own copy; the router's `staleTime` is for loaders with nothing to cache. Scheduler data that lives in IndexedDB or a web worker keeps its own stores; a loader can await them.

**Server data.** One `QueryClient` per page (per request on the server) lives in router context (`src/router.tsx`, `src/app/query-client.ts`); `@tanstack/react-router-ssr-query` wraps the app in its provider and streams what a server render fetched into the page. Each area exports `queryOptions` factories beside its data, so the key, `queryFn`, `staleTime` and retry are written once: published files build on `publishedFile` (hashed, never stale) and `publishedPointer` (a manifest, stale per family) in `~/state/query/published.ts`, and `~/state/query/review-numbers.ts` is the worked example. A route that needs the data first calls `context.queryClient.ensureQueryData(factory(...))` in its loader; the component calls `useQuery(factory(...))` (or `useSuspenseQuery`, which also runs on the server). Writes use `useMutation`, and set or invalidate the same keys. What stays out: local-first data in Dexie and the sync engine, URL state, UI state. Tests render inside `QueryClientProvider` with a fresh `createTestQueryClient()` (`~/state/query/testing`). Docs: `https://tanstack.com/query/latest/docs/framework/react/` and `https://tanstack.com/router/latest/docs/integrations/query` (append `.md` for text).

**Lazy route components.** Start turns on the router plugin's automatic code splitting, so a route's `component` is its own chunk with nothing to write. Don't export route properties from a route file, or splitting can't move them out. `pendingComponent` and `errorComponent` cover loading and failure; `defaultPreload: "intent"` fetches the chunk on hover or focus.

**Links and preload.** Use `Link` (or `navigate`) for every in-app move, never `window.location` or a plain `<a>`, so preloading and history work. `preload={false}` on a link turns it off for one link.

**Durable Objects, D1 or R2.** D1 is the default for anything per user or queryable (accounts, sync docs, reviews, watches). R2 holds files: the catalog, reference data and user uploads. A Durable Object is for live, shared state with sockets; `CourseChat` is our only one, and a second class needs a decision entry.

**Crons.** Add the schedule to `triggers.crons` in `wrangler.jsonc` and the job to `CRON_JOBS` in `src/jobs/index.ts` (a test fails if they drift). Jobs take `now` from the controller, never `Date.now()`. Crons don't run on previews.

**Server calls.** The JSON API is plain Worker routes run by `src/server/api/router.ts` rather than `createServerFn`, on purpose (the file's header says why). Add an endpoint to your area's table, `src/server/<area>/api-routes.ts`, with `route({...})`, its `auth` field, limits and schemas; a new area's table also goes in the router's `ROUTE_TABLES` and `ROUTES`.
